'use strict';

function createAppController() {
  function apiInfo(req, res) {
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

  function health(req, res) {
    res.json({ status: 'ok' });
  }

  return { apiInfo, health };
}

module.exports = { createAppController };
