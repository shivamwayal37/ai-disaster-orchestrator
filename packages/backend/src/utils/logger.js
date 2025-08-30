/**
 * Simple logger utility
 * Provides consistent logging with namespacing
 */

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;

/**
 * Create a logger instance with the given namespace
 * @param {string} namespace - The namespace for the logger
 * @returns {Object} - Winston logger instance
 */
function createNamespaceLogger(namespace) {
  const logFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} [${namespace}] ${level}: ${message}`;
  });

  return createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      logFormat
    ),
    transports: [new transports.Console()]
  });
}

module.exports = createNamespaceLogger;
