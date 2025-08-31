const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Error handling middleware for Express
 * Handles different types of errors and sends appropriate responses
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.stack = process.env.NODE_ENV === 'development' ? err.stack : undefined;

  // Log the error
  logger.error({
    message: err.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    user: req.user ? req.user.id : 'unauthenticated',
    ip: req.ip
  }, 'API Error');

  // Handle specific error types
  if (err.name === 'ValidationError') {
    // Mongoose validation error
    const messages = Object.values(err.errors).map(val => val.message);
    error = new ApiError('Validation failed', 400, 'VALIDATION_ERROR', { errors: messages });
  } else if (err.name === 'CastError') {
    // Mongoose bad ObjectId
    error = new ApiError('Resource not found', 404, 'NOT_FOUND');
  } else if (err.code === 11000) {
    // Mongoose duplicate key
    const field = Object.keys(err.keyValue)[0];
    error = new ApiError(
      `Duplicate field value: ${field}`,
      400,
      'DUPLICATE_KEY',
      { field, value: err.keyValue[field] }
    );
  } else if (err.name === 'JsonWebTokenError') {
    error = new ApiError('Invalid token', 401, 'UNAUTHORIZED');
  } else if (err.name === 'TokenExpiredError') {
    error = new ApiError('Token expired', 401, 'TOKEN_EXPIRED');
  } else if (err.name === 'UnauthorizedError') {
    error = new ApiError('Not authorized', 401, 'UNAUTHORIZED');
  } else if (err.name === 'ForbiddenError') {
    error = new ApiError('Forbidden', 403, 'FORBIDDEN');
  } else if (err.name === 'NotFoundError') {
    error = new ApiError('Resource not found', 404, 'NOT_FOUND');
  } else if (err.name === 'RateLimitExceeded') {
    error = new ApiError(
      'Too many requests, please try again later',
      429,
      'RATE_LIMIT_EXCEEDED',
      { retryAfter: err.retryAfter }
    );
  } else if (!(err instanceof ApiError)) {
    // If it's not one of our custom errors, create a generic one
    error = new ApiError(
      err.message || 'Internal Server Error',
      err.statusCode || 500,
      err.code || 'INTERNAL_SERVER_ERROR',
      err.details
    );
  }

  // Send error response
  res.status(error.statusCode).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    }
  });
};

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found handler middleware
 */
const notFound = (req, res, next) => {
  next(new ApiError(`Not Found - ${req.originalUrl}`, 404, 'NOT_FOUND'));
};

/**
 * Async handler to wrap async/await route handlers
 * This eliminates the need for try/catch blocks in route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  ApiError,
  notFound,
  asyncHandler
};
