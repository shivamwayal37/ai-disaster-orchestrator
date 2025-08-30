/**
 * BigInt JSON serialization support
 * This should be required as early as possible in your application
 */

// Add toJSON method to BigInt prototype
if (typeof BigInt !== 'undefined') {
  BigInt.prototype.toJSON = function() {
    return this.toString();
  };
}

/**
 * Safe JSON stringify that handles BigInt
 * @param {any} data - Data to stringify
 * @returns {string} JSON string
 */
function safeStringify(data) {
  return JSON.stringify(data, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value
  );
}

module.exports = {
  safeStringify
};
