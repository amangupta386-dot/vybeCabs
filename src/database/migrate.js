"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const schema = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'BUSY', 'OFFLINE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id TEXT NOT NULL,
  pickup_latitude DOUBLE PRECISION NOT NULL,
  pickup_longitude DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'ASSIGNED', 'CANCELLED')),
  assigned_driver_id UUID REFERENCES drivers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ride_driver_offers (
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  distance_km DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  PRIMARY KEY (ride_id, driver_id)
);

CREATE TABLE IF NOT EXISTS driver_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_offers_driver_status ON ride_driver_offers(driver_id, status);
`;
async function run() {
    const pool = new pg_1.Pool({
        connectionString: process.env.DATABASE_URL ??
            'postgres://postgres:postgres@localhost:55432/driver_matching',
    });
    try {
        await pool.query(schema);
        console.log('Database schema is ready.');
    }
    finally {
        await pool.end();
    }
}
void run().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map