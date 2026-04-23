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
  const exposeDetails =
    process.env.NODE_ENV === 'development' || process.env.DEBUG_ERRORS === '1';
  return res.status(500).json({
    statusCode: 500,
    message: exposeDetails ? err.message : 'Internal server error',
  });
}

module.exports = { httpErrorHandler };
