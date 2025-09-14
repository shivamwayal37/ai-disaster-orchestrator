/**
 * Maps severity levels from backend to human-readable strings
 */
export const severityMap = {
  1: 'CRITICAL',
  2: 'HIGH',
  3: 'MEDIUM',
  4: 'LOW'
};

/**
 * Gets the appropriate background and border classes based on severity
 * @param {number} severity - The severity level (1-4)
 * @returns {string} Tailwind CSS classes for styling
 */
export const getSeverityClasses = (severity) => {
  const sev = severityMap[severity] || 'UNKNOWN';
  switch (sev) {
    case 'CRITICAL': 
      return 'bg-disaster-red/20 border-disaster-red/50';
    case 'HIGH': 
      return 'bg-disaster-orange/20 border-disaster-orange/50';
    case 'MEDIUM': 
      return 'bg-disaster-yellow/20 border-disaster-yellow/50';
    case 'LOW': 
      return 'bg-disaster-green/20 border-disaster-green/50';
    default: 
      return 'bg-gray-200 border-gray-300';
  }
};

/**
 * Gets the human-readable severity label
 * @param {number} severity - The severity level (1-4)
 * @returns {string} Human-readable severity label
 */
export const getSeverityLabel = (severity) => {
  return severityMap[severity] || 'UNKNOWN';
};
