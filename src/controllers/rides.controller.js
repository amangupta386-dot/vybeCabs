'use strict';

function createRidesController(ridesService) {
  async function requestRide(req, res, next) {
    try {
      const result = await ridesService.requestRide(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async function acceptRide(req, res, next) {
    try {
      const ride = await ridesService.acceptRide(req.params.rideId, req.body.driverId);
      res.json(ride);
    } catch (err) {
      next(err);
    }
  }

  return { requestRide, acceptRide };
}

module.exports = { createRidesController };
