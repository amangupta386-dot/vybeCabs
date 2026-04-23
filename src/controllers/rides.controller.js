'use strict';

class RidesController {
  constructor(ridesService) {
    this.ridesService = ridesService;
  }

  async requestRide(req, res, next) {
    try {
      const result = await this.ridesService.requestRide(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async acceptRide(req, res, next) {
    try {
      const ride = await this.ridesService.acceptRide(req.params.rideId, req.body.driverId);
      res.json(ride);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { RidesController };
