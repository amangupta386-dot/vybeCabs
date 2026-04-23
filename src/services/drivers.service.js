'use strict';

const { DriverStatus } = require('../dtos/upsert-driver.dto');

const DRIVER_GEO_KEY = 'drivers:geo';
const AVAILABLE_DRIVERS_KEY = 'drivers:available';

function createDriversService(pool, redis) {
  async function syncDriverInRedis(driverId, longitude, latitude, status) {
    if (status === DriverStatus.AVAILABLE) {
      await redis
        .multi()
        .geoadd(DRIVER_GEO_KEY, longitude, latitude, driverId)
        .sadd(AVAILABLE_DRIVERS_KEY, driverId)
        .exec();
      return;
    }
    await redis.multi().zrem(DRIVER_GEO_KEY, driverId).srem(AVAILABLE_DRIVERS_KEY, driverId).exec();
  }

  async function upsert(dto) {
    const result = await pool.query(
      `
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
      `,
      [dto.id ?? null, dto.name, dto.latitude, dto.longitude, dto.status],
    );
    const driver = result.rows[0];
    await syncDriverInRedis(driver.id, driver.longitude, driver.latitude, driver.status);
    return driver;
  }

  async function markBusy(driverId) {
    await pool.query(`UPDATE drivers SET status = 'BUSY', updated_at = now() WHERE id = $1`, [driverId]);
    await redis.srem(AVAILABLE_DRIVERS_KEY, driverId);
  }

  return { upsert, markBusy };
}

module.exports = {
  createDriversService,
  DRIVER_GEO_KEY,
  AVAILABLE_DRIVERS_KEY,
};
