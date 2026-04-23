'use strict';

const { Pool } = require('pg');

function createPool() {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:55432/driver_matching',
  });
}

module.exports = { createPool };
