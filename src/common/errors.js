'use strict';

function createHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function badRequest(message = 'Bad Request') {
  return createHttpError(400, message);
}

function unauthorized(message = 'Unauthorized') {
  return createHttpError(401, message);
}

function forbidden(message = 'Forbidden') {
  return createHttpError(403, message);
}

function notFound(message = 'Not Found') {
  return createHttpError(404, message);
}

function conflict(message = 'Conflict') {
  return createHttpError(409, message);
}

function isHttpError(err) {
  return Boolean(err && Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600);
}

module.exports = {
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  isHttpError,
};
