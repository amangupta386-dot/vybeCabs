'use strict';

require('reflect-metadata');

const express = require('express');
const path = require('path');
const { createPool } = require('./models/database');
const { createRedis } = require('./models/redis');
const { createDriversService } = require('./services/drivers.service');
const { createRidesService } = require('./services/rides.service');
const { createAppController } = require('./controllers/app.controller');
const { createDriversController } = require('./controllers/drivers.controller');
const { createRidesController } = require('./controllers/rides.controller');
const { registerRoutes } = require('./routes');
const { httpErrorHandler } = require('./middlewares/http-error.middleware');

function createApp(pool, redis) {
  const driversService = createDriversService(pool, redis);
  const ridesService = createRidesService(pool, redis);
  const appController = createAppController();
  const driversController = createDriversController(driversService);
  const ridesController = createRidesController(ridesService);

  const app = express();
  app.use(express.json());

  registerRoutes(app, {
    appController,
    driversController,
    ridesController,
  });

  const publicPath = path.join(process.cwd(), 'public');
  app.use((req, res, next) => {
    const p = req.path;
    if (
      p.startsWith('/api') ||
      p === '/health' ||
      p.startsWith('/drivers') ||
      p.startsWith('/rides')
    ) {
      return next();
    }
    return express.static(publicPath)(req, res, next);
  });

  app.use((req, res) => {
    res.status(404).json({ statusCode: 404, message: 'Not Found' });
  });

  app.use(httpErrorHandler);

  return app;
}

async function bootstrap() {
  const pool = createPool();
  const redis = createRedis();
  const app = createApp(pool, redis);
  const port = Number(process.env.PORT ?? 3000);
  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Listening on http://localhost:${port}`);
  });

  const shutdown = async () => {
    server.close();
    await pool.end();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  void bootstrap();
}

module.exports = { createApp, createPool, createRedis };
