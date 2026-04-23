'use strict';

function createDriversController(driversService) {
  async function upsert(req, res, next) {
    try {
      const driver = await driversService.upsert(req.body);
      res.json(driver);
    } catch (err) {
      next(err);
    }
  }

  return { upsert };
}

module.exports = { createDriversController };
