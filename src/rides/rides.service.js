"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RidesService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
const drivers_service_1 = require("../drivers/drivers.service");
const database_module_1 = require("../database/database.module");
const redis_module_1 = require("../redis/redis.module");
const OFFER_KEY_PREFIX = 'ride:offers:';
const ASSIGNMENT_KEY_PREFIX = 'ride:assigned:';
const acceptRideLua = `
local offersKey = KEYS[1]
local assignedKey = KEYS[2]
local availableKey = KEYS[3]
local driverId = ARGV[1]

if redis.call('SISMEMBER', offersKey, driverId) == 0 then
  return 'NOT_OFFERED'
end

if redis.call('SISMEMBER', availableKey, driverId) == 0 then
  return 'NOT_AVAILABLE'
end

if redis.call('SET', assignedKey, driverId, 'NX', 'EX', 3600) then
  redis.call('SREM', availableKey, driverId)
  return 'ACCEPTED'
end

return 'ALREADY_ASSIGNED'
`;
let RidesService = class RidesService {
    constructor(pool, redis) {
        this.pool = pool;
        this.redis = redis;
    }
    async requestRide(dto) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const rideResult = await client.query(`
        INSERT INTO rides (rider_id, pickup_latitude, pickup_longitude, status)
        VALUES ($1, $2, $3, 'REQUESTED')
        RETURNING id, rider_id, pickup_latitude, pickup_longitude, status
        `, [dto.riderId, dto.pickupLatitude, dto.pickupLongitude]);
            const ride = rideResult.rows[0];
            const candidates = await this.findNearestAvailableDrivers(dto.pickupLongitude, dto.pickupLatitude);
            const enrichedCandidates = await this.enrichDriverCandidates(client, candidates);
            await Promise.all(enrichedCandidates.map((candidate) => client.query(`
            INSERT INTO ride_driver_offers (ride_id, driver_id, distance_km, status)
            VALUES ($1, $2, $3, 'PENDING')
            `, [ride.id, candidate.driverId, candidate.distanceKm])));
            await client.query('COMMIT');
            await this.cacheOffers(ride.id, enrichedCandidates);
            await this.notifyDrivers(ride.id, enrichedCandidates);
            return {
                ride,
                notifiedDrivers: enrichedCandidates,
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async acceptRide(rideId, driverId) {
        const redisDecision = await this.redis.eval(acceptRideLua, 3, this.offerKey(rideId), this.assignmentKey(rideId), drivers_service_1.AVAILABLE_DRIVERS_KEY, driverId);
        if (redisDecision === 'NOT_OFFERED') {
            throw new common_1.ForbiddenException('Driver was not offered this ride.');
        }
        if (redisDecision === 'NOT_AVAILABLE') {
            throw new common_1.ConflictException('Driver is no longer available.');
        }
        if (redisDecision === 'ALREADY_ASSIGNED') {
            throw new common_1.ConflictException('Ride has already been assigned.');
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const assigned = await this.persistAssignment(client, rideId, driverId);
            await client.query('COMMIT');
            return assigned;
        }
        catch (error) {
            await client.query('ROLLBACK');
            await this.redis.del(this.assignmentKey(rideId));
            await this.redis.sadd(drivers_service_1.AVAILABLE_DRIVERS_KEY, driverId);
            throw error;
        }
        finally {
            client.release();
        }
    }
    async findNearestAvailableDrivers(longitude, latitude) {
        const radiusKm = Number(process.env.MATCH_RADIUS_KM ?? 10);
        const raw = (await this.redis.call('GEOSEARCH', drivers_service_1.DRIVER_GEO_KEY, 'FROMLONLAT', longitude, latitude, 'BYRADIUS', radiusKm, 'km', 'ASC', 'WITHDIST', 'COUNT', 20));
        const candidates = [];
        for (const [driverId, distance] of raw) {
            const isAvailable = await this.redis.sismember(drivers_service_1.AVAILABLE_DRIVERS_KEY, driverId);
            if (isAvailable) {
                candidates.push({ driverId, distanceKm: Number(distance) });
            }
        }
        return candidates;
    }
    async enrichDriverCandidates(client, candidates) {
        if (candidates.length === 0) {
            return [];
        }
        const driverIds = candidates.map((candidate) => candidate.driverId);
        const result = await client.query(`
      SELECT id, name, latitude, longitude, status
      FROM drivers
      WHERE id = ANY($1::uuid[])
      `, [driverIds]);
        const driversById = new Map(result.rows.map((driver) => [driver.id, driver]));
        return candidates
            .map((candidate) => {
            const driver = driversById.get(candidate.driverId);
            if (!driver || driver.status !== 'AVAILABLE') {
                return null;
            }
            return {
                ...candidate,
                driverName: driver.name,
                latitude: driver.latitude,
                longitude: driver.longitude,
                status: driver.status,
            };
        })
            .filter(Boolean)
            .slice(0, 3);
    }
    async cacheOffers(rideId, candidates) {
        if (candidates.length === 0) {
            return;
        }
        await this.redis
            .multi()
            .sadd(this.offerKey(rideId), ...candidates.map((candidate) => candidate.driverId))
            .expire(this.offerKey(rideId), 300)
            .exec();
    }
    async notifyDrivers(rideId, candidates) {
        await Promise.all(candidates.map((candidate) => this.pool.query(`
          INSERT INTO driver_notifications (ride_id, driver_id, channel, payload)
          VALUES ($1, $2, 'IN_APP', $3)
          `, [
            rideId,
            candidate.driverId,
            {
                rideId,
                driverId: candidate.driverId,
                driverName: candidate.driverName,
                distanceKm: candidate.distanceKm,
                message: 'New ride request available',
            },
        ])));
    }
    async persistAssignment(client, rideId, driverId) {
        const rideResult = await client.query(`
      UPDATE rides
      SET status = 'ASSIGNED', assigned_driver_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'REQUESTED' AND assigned_driver_id IS NULL
      RETURNING id, rider_id, pickup_latitude, pickup_longitude, status, assigned_driver_id
      `, [rideId, driverId]);
        if (rideResult.rowCount === 0) {
            const existingRide = await client.query(`SELECT id FROM rides WHERE id = $1`, [rideId]);
            if (existingRide.rowCount === 0) {
                throw new common_1.NotFoundException('Ride not found.');
            }
            throw new common_1.ConflictException('Ride has already been assigned.');
        }
        await client.query(`
      UPDATE ride_driver_offers
      SET status = CASE WHEN driver_id = $2 THEN 'ACCEPTED' ELSE 'EXPIRED' END,
          responded_at = CASE WHEN driver_id = $2 THEN now() ELSE responded_at END
      WHERE ride_id = $1
      `, [rideId, driverId]);
        await client.query(`UPDATE drivers SET status = 'BUSY', updated_at = now() WHERE id = $1`, [driverId]);
        return rideResult.rows[0];
    }
    offerKey(rideId) {
        return `${OFFER_KEY_PREFIX}${rideId}`;
    }
    assignmentKey(rideId) {
        return `${ASSIGNMENT_KEY_PREFIX}${rideId}`;
    }
};
exports.RidesService = RidesService;
exports.RidesService = RidesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __param(1, (0, common_1.Inject)(redis_module_1.REDIS)),
    __metadata("design:paramtypes", [pg_1.Pool,
        ioredis_1.default])
], RidesService);
//# sourceMappingURL=rides.service.js.map
