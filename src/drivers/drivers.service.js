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
exports.DRIVER_GEO_KEY = exports.AVAILABLE_DRIVERS_KEY = exports.DriversService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
const database_module_1 = require("../database/database.module");
const redis_module_1 = require("../redis/redis.module");
const upsert_driver_dto_1 = require("./dto/upsert-driver.dto");
const DRIVER_GEO_KEY = 'drivers:geo';
exports.DRIVER_GEO_KEY = DRIVER_GEO_KEY;
const AVAILABLE_DRIVERS_KEY = 'drivers:available';
exports.AVAILABLE_DRIVERS_KEY = AVAILABLE_DRIVERS_KEY;
let DriversService = class DriversService {
    constructor(pool, redis) {
        this.pool = pool;
        this.redis = redis;
    }
    async upsert(dto) {
        const result = await this.pool.query(`
      INSERT INTO drivers (id, name, latitude, longitude, status)
      VALUES (COALESCE($1, uuid_generate_v4()), $2, $3, $4, $5)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING id, name, latitude, longitude, status
      `, [dto.id ?? null, dto.name, dto.latitude, dto.longitude, dto.status]);
        const driver = result.rows[0];
        await this.syncDriverInRedis(driver.id, driver.longitude, driver.latitude, driver.status);
        return driver;
    }
    async markBusy(driverId) {
        await this.pool.query(`UPDATE drivers SET status = 'BUSY', updated_at = now() WHERE id = $1`, [driverId]);
        await this.redis.srem(AVAILABLE_DRIVERS_KEY, driverId);
    }
    async syncDriverInRedis(driverId, longitude, latitude, status) {
        if (status === upsert_driver_dto_1.DriverStatus.AVAILABLE) {
            await this.redis
                .multi()
                .geoadd(DRIVER_GEO_KEY, longitude, latitude, driverId)
                .sadd(AVAILABLE_DRIVERS_KEY, driverId)
                .exec();
            return;
        }
        await this.redis.multi().zrem(DRIVER_GEO_KEY, driverId).srem(AVAILABLE_DRIVERS_KEY, driverId).exec();
    }
};
exports.DriversService = DriversService;
exports.DriversService = DriversService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_POOL)),
    __param(1, (0, common_1.Inject)(redis_module_1.REDIS)),
    __metadata("design:paramtypes", [pg_1.Pool,
        ioredis_1.default])
], DriversService);
//# sourceMappingURL=drivers.service.js.map