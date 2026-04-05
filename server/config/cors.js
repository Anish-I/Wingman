'use strict';

function createCorsError(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}

function createCorsOptions(allowedOrigins) {
  return {
    origin(origin, callback) {
      if (!origin) {
        return callback(createCorsError('Origin header required'));
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(createCorsError('Not allowed by CORS'));
    },
    credentials: true,
  };
}

module.exports = { createCorsOptions };
