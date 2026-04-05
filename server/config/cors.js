'use strict';

function createCorsError(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}

function createCorsOptions(allowedOrigins) {
  return {
    origin(origin, callback) {
      // No Origin header → not a browser request (native mobile app, health
      // probe, curl, server-to-server).  CORS is a browser-only mechanism and
      // does not protect against non-browser clients (JWT auth handles that),
      // so allow these requests through without CORS headers.
      if (!origin) {
        return callback(null, false);
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
