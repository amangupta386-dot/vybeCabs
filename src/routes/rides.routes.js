'use strict';

const { Router } = require('express');
const { optionalAuth } = require('../middlewares/auth/auth.middleware');
const { validateBody } = require('../middlewares/validation/validate-body.middleware');
const { RequestRideDto } = require('../dtos/request-ride.dto');
const { AcceptRideDto } = require('../dtos/accept-ride.dto');

function createRidesRouter(ridesController) {
  const router = Router();
  router.post(
    '/',
    optionalAuth,
    validateBody(RequestRideDto),
    (req, res, next) => ridesController.requestRide(req, res, next),
  );
  router.post(
    '/:rideId/accept',
    optionalAuth,
    validateBody(AcceptRideDto),
    (req, res, next) => ridesController.acceptRide(req, res, next),
  );
  return router;
}

module.exports = { createRidesRouter };
