'use strict';

const Redis = require('ioredis');

function createRedis() {
  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
}

module.exports = { createRedis };
