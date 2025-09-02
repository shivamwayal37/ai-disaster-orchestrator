const { validationResult } = require('express-validator');
const { ApiResponse } = require('./apiResponse');

/**
 * Validation utility for request validation
 */
class Validator {
  /**
   * Validate request parameters against validation rules
   * @param {Array} validations - Array of validation rules
   * @returns {Array} - Array of middleware functions
   */
  static validate(validations) {
    return [
      ...validations,
      (req, res, next) => {
        const errors = validationResult(req);
        
        if (errors.isEmpty()) {
          return next();
        }
        
        // Format validation errors
        const formattedErrors = errors.array().map(error => ({
          param: error.param,
          location: error.location,
          msg: error.msg,
          value: error.value
        }));
        
        return ApiResponse.validationError(res, formattedErrors);
      }
    ];
  }

  /**
   * Common validation rules for pagination
   */
  static paginationRules() {
    return [
      query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt(),
      query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').toInt(),
      query('sortBy').optional().isString().trim().notEmpty().withMessage('Sort field cannot be empty'),
      query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be either "asc" or "desc"')
    ];
  }

  /**
   * Common validation rules for date range
   */
  static dateRangeRules() {
    return [
      query('startDate').optional().isISO8601().withMessage('Invalid start date format. Use ISO 8601 format'),
      query('endDate').optional().isISO8601().withMessage('Invalid end date format. Use ISO 8601 format')
    ];
  }

  /**
   * Validate UUID
   */
  static uuid(field) {
    return [
      param(field).isUUID().withMessage(`Invalid ${field} format`)
    ];
  }

  /**
   * Validate MongoDB ObjectId
   */
  static objectId(field) {
    return [
      param(field).isMongoId().withMessage(`Invalid ${field} format`)
    ];
  }

  /**
   * Validate coordinates
   */
  static coordinates() {
    return [
      body('coordinates.latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitude must be between -90 and 90'),
      body('coordinates.longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitude must be between -180 and 180')
    ];
  }

  /**
   * Validate email
   */
  static email(field = 'email') {
    return [
      body(field).isEmail().normalizeEmail().withMessage('Invalid email address')
    ];
  }

  /**
   * Validate password
   */
  static password(field = 'password') {
    return [
      body(field)
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/[a-z]/)
        .withMessage('Password must contain at least one lowercase letter')
        .matches(/[A-Z]/)
        .withMessage('Password must contain at least one uppercase letter')
        .matches(/\d/)
        .withMessage('Password must contain at least one number')
        .matches(/[^a-zA-Z0-9]/)
        .withMessage('Password must contain at least one special character')
    ];
  }

  /**
   * Validate enum values
   */
  static enum(field, values, message = null) {
    return [
      body(field)
        .isIn(values)
        .withMessage(message || `${field} must be one of: ${values.join(', ')}`)
    ];
  }

  /**
   * Validate array of values
   */
  static array(field, options = {}) {
    const { min, max, unique = true } = options;
    const validations = [
      body(field)
        .isArray()
        .withMessage(`${field} must be an array`)
    ];

    if (min !== undefined) {
      validations.push(
        body(field)
          .isArray({ min })
          .withMessage(`${field} must contain at least ${min} items`)
      );
    }

    if (max !== undefined) {
      validations.push(
        body(field)
          .isArray({ max })
          .withMessage(`${field} cannot contain more than ${max} items`)
      );
    }

    if (unique) {
      validations.push(
        body(field).custom((array) => {
          if (new Set(array).size !== array.length) {
            throw new Error(`${field} contains duplicate values`);
          }
          return true;
        })
      );
    }

    return validations;
  }

  /**
   * Validate file upload
   */
  static file(field, options = {}) {
    const { required = true, mimeTypes = [], maxSize = 5 * 1024 * 1024 } = options;
    const validations = [];

    if (required) {
      validations.push(
        (req, res, next) => {
          if (!req.file) {
            return ApiResponse.error(res, `${field} is required`, 'VALIDATION_ERROR', 400);
          }
          next();
        }
      );
    }

    if (mimeTypes.length > 0) {
      validations.push(
        (req, res, next) => {
          if (req.file && !mimeTypes.includes(req.file.mimetype)) {
            return ApiResponse.error(
              res,
              `Invalid file type. Allowed types: ${mimeTypes.join(', ')}`,
              'INVALID_FILE_TYPE',
              400
            );
          }
          next();
        }
      );
    }

    if (maxSize) {
      validations.push(
        (req, res, next) => {
          if (req.file && req.file.size > maxSize) {
            return ApiResponse.error(
              res,
              `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`,
              'FILE_TOO_LARGE',
              400
            );
          }
          next();
        }
      );
    }

    return validations;
  }
}

const sanitizeQuery = (query) => {
  if (typeof query !== 'string') {
    return '';
  }
  // Basic sanitization: trim whitespace and remove excessive spaces
  return query.trim().replace(/\s+/g, ' ');
};

const validateResponse = (response) => {
  // Placeholder for AI response validation logic
  return response;
};

module.exports = {
  Validator,
  sanitizeQuery,
  validateResponse,
  ...require('express-validator')
};
