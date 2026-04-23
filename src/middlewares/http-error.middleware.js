'use strict';

const { HttpException } = require('../common/errors');

function httpErrorHandler(err, req, res, _next) {
  if (res.headersSent) {
    return _next(err);
  }
  if (err instanceof HttpException) {
    return res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
    });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({
    statusCode: 500,
    message: 'Internal server error',
  });
}

module.exports = { httpErrorHandler };
