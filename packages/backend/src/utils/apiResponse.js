/**
 * API Response Utility
 * 
 * Provides consistent response formatting for all API endpoints
 */

class ApiResponse {
  /**
   * Create a success response
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {string} message - Optional success message
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  static success(res, data = null, message = 'Operation successful', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create an error response
   * @param {Object} res - Express response object
   * @param {string|Error} error - Error message or Error object
   * @param {string} code - Custom error code
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {*} details - Additional error details
   */
  static error(res, error, code = 'INTERNAL_ERROR', statusCode = 500, details = null) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return res.status(statusCode).json({
      success: false,
      error: {
        code,
        message: errorMessage,
        details,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Create a validation error response
   * @param {Object} res - Express response object
   * @param {Array} errors - Array of validation errors
   */
  static validationError(res, errors) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Create a not found response
   * @param {Object} res - Express response object
   * @param {string} resource - Name of the resource not found
   * @param {string} id - ID of the resource not found
   */
  static notFound(res, resource, id = null) {
    const message = id 
      ? `${resource} with ID ${id} not found`
      : `${resource} not found`;
    
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Create an unauthorized response
   * @param {Object} res - Express response object
   * @param {string} message - Optional custom message
   */
  static unauthorized(res, message = 'Unauthorized') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Create a forbidden response
   * @param {Object} res - Express response object
   * @param {string} message - Optional custom message
   */
  static forbidden(res, message = 'Forbidden') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Create a conflict response
   * @param {Object} res - Express response object
   * @param {string} message - Optional custom message
   * @param {*} details - Additional conflict details
   */
  static conflict(res, message = 'Resource already exists', details = null) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message,
        details,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Create a rate limited response
   * @param {Object} res - Express response object
   * @param {string} message - Optional custom message
   * @param {number} retryAfter - Seconds to wait before retrying
   */
  static tooManyRequests(res, message = 'Too many requests', retryAfter = 60) {
    res.set('Retry-After', String(retryAfter));
    
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfter,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Create a paginated response
   * @param {Object} res - Express response object
   * @param {Array} items - Array of items
   * @param {number} total - Total number of items
   * @param {number} page - Current page number
   * @param {number} limit - Items per page
   * @param {Object} meta - Additional metadata
   */
  static paginated(res, items, total, page, limit, meta = {}) {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return res.status(200).json({
      success: true,
      data: items,
      pagination: {
        total,
        totalPages,
        page,
        limit,
        hasNext,
        hasPrev,
        nextPage: hasNext ? page + 1 : null,
        prevPage: hasPrev ? page - 1 : null
      },
      ...meta,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = ApiResponse;
