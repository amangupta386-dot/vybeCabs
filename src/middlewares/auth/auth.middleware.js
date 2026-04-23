'use strict';

const { UnauthorizedException } = require('../../common/errors');

/**
 * When `API_KEY` is set, requires `Authorization: Bearer <API_KEY>`.
 * When unset, skips authentication (local development).
 */
function optionalAuth(req, _res, next) {
  const expected = process.env.API_KEY;
  if (!expected) {
    return next();
  }
  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== expected) {
    return next(new UnauthorizedException('Invalid or missing API key'));
  }
  return next();
}

module.exports = { optionalAuth };
