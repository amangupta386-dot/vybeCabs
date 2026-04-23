'use strict';

const { Router } = require('express');
const { optionalAuth } = require('../middlewares/auth/auth.middleware');
const { validateBody } = require('../middlewares/validation/validate-body.middleware');
const { UpsertDriverDto } = require('../dtos/upsert-driver.dto');

function createDriversRouter(driversController) {
  const router = Router();
  router.post(
    '/',
    optionalAuth,
    validateBody(UpsertDriverDto),
    (req, res, next) => driversController.upsert(req, res, next),
  );
  return router;
}

module.exports = { createDriversRouter };
