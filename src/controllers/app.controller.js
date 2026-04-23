'use strict';

class AppController {
  apiInfo(req, res) {
    res.json({
      name: 'Driver Matching System',
      status: 'running',
      endpoints: {
        createDriver: 'POST /drivers',
        requestRide: 'POST /rides',
        acceptRide: 'POST /rides/:rideId/accept',
        health: 'GET /health',
      },
    });
  }

  health(req, res) {
    res.json({ status: 'ok' });
  }
}

module.exports = { AppController };
