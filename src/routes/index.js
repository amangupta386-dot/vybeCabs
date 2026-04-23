'use strict';

const { createDriversRouter } = require('./drivers.routes');
const { createRidesRouter } = require('./rides.routes');

/**
 * Registers HTTP routes. Order for mutating endpoints: auth → validation → controller
 * (wired per-route in the domain routers below).
 */
function registerRoutes(app, controllers) {
  const { appController, driversController, ridesController } = controllers;

  app.get('/api', (req, res) => appController.apiInfo(req, res));
  app.get('/health', (req, res) => appController.health(req, res));

  app.use('/drivers', createDriversRouter(driversController));
  app.use('/rides', createRidesRouter(ridesController));
}

module.exports = { registerRoutes };
