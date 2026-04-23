'use strict';

const { DriverStatus } = require('../dtos/upsert-driver.dto');

const DRIVER_GEO_KEY = 'drivers:geo';
const AVAILABLE_DRIVERS_KEY = 'drivers:available';

class DriversService {
  constructor(pool, redis) {
    this.pool = pool;
    this.redis = redis;
  }

  async upsert(dto) {
    const result = await this.pool.query(
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
    await this.syncDriverInRedis(driver.id, driver.longitude, driver.latitude, driver.status);
    return driver;
  }

  async markBusy(driverId) {
    await this.pool.query(`UPDATE drivers SET status = 'BUSY', updated_at = now() WHERE id = $1`, [
      driverId,
    ]);
    await this.redis.srem(AVAILABLE_DRIVERS_KEY, driverId);
  }

  async syncDriverInRedis(driverId, longitude, latitude, status) {
    if (status === DriverStatus.AVAILABLE) {
      await this.redis
        .multi()
        .geoadd(DRIVER_GEO_KEY, longitude, latitude, driverId)
        .sadd(AVAILABLE_DRIVERS_KEY, driverId)
        .exec();
      return;
    }
    await this.redis.multi().zrem(DRIVER_GEO_KEY, driverId).srem(AVAILABLE_DRIVERS_KEY, driverId).exec();
  }
}

module.exports = {
  DriversService,
  DRIVER_GEO_KEY,
  AVAILABLE_DRIVERS_KEY,
};
