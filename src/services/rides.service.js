'use strict';

const { forbidden, conflict, notFound } = require('../common/errors');
const { AVAILABLE_DRIVERS_KEY, DRIVER_GEO_KEY } = require('./drivers.service');

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

function createRidesService(pool, redis) {
  function offerKey(rideId) {
    return `${OFFER_KEY_PREFIX}${rideId}`;
  }

  function assignmentKey(rideId) {
    return `${ASSIGNMENT_KEY_PREFIX}${rideId}`;
  }

  async function findNearestAvailableDrivers(longitude, latitude) {
    const radiusKm = Number(process.env.MATCH_RADIUS_KM ?? 10);
    const raw = await redis.call(
      'GEOSEARCH',
      DRIVER_GEO_KEY,
      'FROMLONLAT',
      longitude,
      latitude,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'WITHDIST',
      'COUNT',
      20,
    );
    const candidates = [];
    for (const [driverId, distance] of raw) {
      const isAvailable = await redis.sismember(AVAILABLE_DRIVERS_KEY, driverId);
      if (isAvailable) {
        candidates.push({ driverId, distanceKm: Number(distance) });
      }
    }
    return candidates;
  }

  async function enrichDriverCandidates(client, candidates) {
    if (candidates.length === 0) {
      return [];
    }
    const driverIds = candidates.map((candidate) => candidate.driverId);
    const result = await client.query(
      `
      SELECT id, name, latitude, longitude, status
      FROM drivers
      WHERE id = ANY($1::uuid[])
      `,
      [driverIds],
    );
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

  async function cacheOffers(rideId, candidates) {
    if (candidates.length === 0) {
      return;
    }
    await redis
      .multi()
      .sadd(offerKey(rideId), ...candidates.map((candidate) => candidate.driverId))
      .expire(offerKey(rideId), 300)
      .exec();
  }

  async function notifyDrivers(rideId, candidates) {
    await Promise.all(
      candidates.map((candidate) =>
        pool.query(
          `
          INSERT INTO driver_notifications (ride_id, driver_id, channel, payload)
          VALUES ($1, $2, 'IN_APP', $3)
          `,
          [
            rideId,
            candidate.driverId,
            {
              rideId,
              driverId: candidate.driverId,
              driverName: candidate.driverName,
              distanceKm: candidate.distanceKm,
              message: 'New ride request available',
            },
          ],
        ),
      ),
    );
  }

  async function persistAssignment(client, rideId, driverId) {
    const rideResult = await client.query(
      `
      UPDATE rides
      SET status = 'ASSIGNED', assigned_driver_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'REQUESTED' AND assigned_driver_id IS NULL
      RETURNING id, rider_id, pickup_latitude, pickup_longitude, status, assigned_driver_id
      `,
      [rideId, driverId],
    );
    if (rideResult.rowCount === 0) {
      const existingRide = await client.query(`SELECT id FROM rides WHERE id = $1`, [rideId]);
      if (existingRide.rowCount === 0) {
        throw notFound('Ride not found.');
      }
      throw conflict('Ride has already been assigned.');
    }
    await client.query(
      `
      UPDATE ride_driver_offers
      SET status = CASE WHEN driver_id = $2 THEN 'ACCEPTED' ELSE 'EXPIRED' END,
          responded_at = CASE WHEN driver_id = $2 THEN now() ELSE responded_at END
      WHERE ride_id = $1
      `,
      [rideId, driverId],
    );
    await client.query(`UPDATE drivers SET status = 'BUSY', updated_at = now() WHERE id = $1`, [driverId]);
    return rideResult.rows[0];
  }

  async function requestRide(dto) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rideResult = await client.query(
        `
        INSERT INTO rides (rider_id, pickup_latitude, pickup_longitude, status)
        VALUES ($1, $2, $3, 'REQUESTED')
        RETURNING id, rider_id, pickup_latitude, pickup_longitude, status
        `,
        [dto.riderId, dto.pickupLatitude, dto.pickupLongitude],
      );
      const ride = rideResult.rows[0];
      const candidates = await findNearestAvailableDrivers(dto.pickupLongitude, dto.pickupLatitude);
      const enrichedCandidates = await enrichDriverCandidates(client, candidates);
      await Promise.all(
        enrichedCandidates.map((candidate) =>
          client.query(
            `
            INSERT INTO ride_driver_offers (ride_id, driver_id, distance_km, status)
            VALUES ($1, $2, $3, 'PENDING')
            `,
            [ride.id, candidate.driverId, candidate.distanceKm],
          ),
        ),
      );
      await client.query('COMMIT');
      await cacheOffers(ride.id, enrichedCandidates);
      await notifyDrivers(ride.id, enrichedCandidates);
      return {
        ride,
        notifiedDrivers: enrichedCandidates,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function acceptRide(rideId, driverId) {
    const redisDecision = await redis.eval(
      acceptRideLua,
      3,
      offerKey(rideId),
      assignmentKey(rideId),
      AVAILABLE_DRIVERS_KEY,
      driverId,
    );
    if (redisDecision === 'NOT_OFFERED') {
      throw forbidden('Driver was not offered this ride.');
    }
    if (redisDecision === 'NOT_AVAILABLE') {
      throw conflict('Driver is no longer available.');
    }
    if (redisDecision === 'ALREADY_ASSIGNED') {
      throw conflict('Ride has already been assigned.');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const assigned = await persistAssignment(client, rideId, driverId);
      await client.query('COMMIT');
      return assigned;
    } catch (error) {
      await client.query('ROLLBACK');
      await redis.del(assignmentKey(rideId));
      await redis.sadd(AVAILABLE_DRIVERS_KEY, driverId);
      throw error;
    } finally {
      client.release();
    }
  }

  return { requestRide, acceptRide };
}

module.exports = { createRidesService };
