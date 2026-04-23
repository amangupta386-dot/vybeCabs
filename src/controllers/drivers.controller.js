'use strict';

class DriversController {
  constructor(driversService) {
    this.driversService = driversService;
  }

  async upsert(req, res, next) {
    try {
      const driver = await this.driversService.upsert(req.body);
      res.json(driver);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = { DriversController };
