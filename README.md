# Driver Matching System

NestJS assignment implementation for matching a rider with the nearest available driver.

## What It Does

- Stores drivers, rides, offers, and notification records in PostgreSQL.
- Stores available driver locations in Redis GEO sets.
- Finds the three nearest available drivers for each ride request.
- Notifies the three drivers concurrently.
- Assigns exactly one driver: the first valid accept wins.
- Handles race conditions with an atomic Redis Lua script plus a guarded PostgreSQL update.

## Run Locally

```bash
npm install
docker compose up -d postgres redis
npm run db:sync
npm run start
```

The frontend and API run on `http://localhost:3000` by default.

PostgreSQL is exposed on host port `55432` to avoid conflicts with local Postgres installs. The codebase runs directly as JavaScript with `node src/main.js`.

## API

Create or update a driver:

```bash
curl -X POST http://localhost:3000/drivers \
  -H "Content-Type: application/json" \
  -d '{"name":"Asha","latitude":28.6139,"longitude":77.2090,"status":"AVAILABLE"}'
```

Request a ride:

```bash
curl -X POST http://localhost:3000/rides \
  -H "Content-Type: application/json" \
  -d '{"riderId":"rider-1","pickupLatitude":28.6140,"pickupLongitude":77.2100}'
```

Accept a ride:

```bash
curl -X POST http://localhost:3000/rides/<ride-id>/accept \
  -H "Content-Type: application/json" \
  -d '{"driverId":"<driver-id>"}'
```

## Race Condition Handling

Accepting a ride is protected in two layers:

1. Redis executes a Lua script atomically. It checks that the driver was one of the three offered drivers, verifies the driver is still available, and writes `ride:assigned:<rideId>` with `SET NX`. Only the first accept can create this key.
2. PostgreSQL persists the result with:

```sql
WHERE id = $1 AND status = 'REQUESTED' AND assigned_driver_id IS NULL
```

That means even if two requests arrive at nearly the same time, only one driver can win in Redis, and only one database update can move the ride from `REQUESTED` to `ASSIGNED`.

If the database transaction fails after Redis accepts a winner, the service removes the temporary Redis assignment and puts the driver back into the available set.

## Tests

```bash
npm test
```

The included unit tests focus on the critical accept path: invalid offers, late accepts, and the guarded SQL update used to persist the Redis winner.
