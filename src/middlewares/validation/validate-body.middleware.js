'use strict';

/** Required by class-transformer / class-validator decorator metadata at runtime */
require('reflect-metadata');

const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { badRequest } = require('../../common/errors');

function formatValidationErrors(errors) {
  const messages = [];
  for (const err of errors) {
    if (err.constraints) {
      messages.push(...Object.values(err.constraints));
    }
    if (err.children?.length) {
      messages.push(...formatValidationErrors(err.children));
    }
  }
  return messages;
}

/**
 * Express middleware: validates req.body against a class-validator DTO class.
 */
function validateBody(DtoClass) {
  return async (req, res, next) => {
    try {
      const instance = plainToInstance(DtoClass, req.body, {
        enableImplicitConversion: true,
      });
      const errors = await validate(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (errors.length > 0) {
        const message = formatValidationErrors(errors).join('; ') || 'Validation failed';
        throw badRequest(message);
      }
      req.body = instance;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { validateBody };
