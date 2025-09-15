'use client'

import { 
  Flame, 
  Droplets, 
  Mountain, 
  Zap, 
  Wind, 
  AlertTriangle,
  MapPin,
  Clock,
  Loader2,
  TrendingUp
} from 'lucide-react'

/**
 * Maps disaster types to appropriate Lucide React icons
 * 
 * @param {string} type - Disaster type (e.g., 'wildfire', 'flood')
 * @returns {JSX.Element} Corresponding icon component
 */
const getAlertIcon = (type) => {
  switch (type?.toLowerCase()) {
    case 'wildfire':
    case 'fire':
      return <Flame />              // Fire icon for wildfire alerts
    case 'flood':
    case 'flooding':
      return <Droplets />           // Water droplets for flood alerts
    case 'earthquake':
      return <Mountain />           // Mountain icon for earthquake alerts
    case 'storm':
    case 'tornado':
      return <Wind />               // Wind icon for storm/tornado alerts
    case 'power':
    case 'electrical':
      return <Zap />                // Lightning bolt for electrical alerts
    default:
      return <AlertTriangle />      // Generic alert triangle for unknown types
  }
}

/**
 * Formats timestamp into human-readable relative time
 * 
 * Handles multiple timestamp field formats and provides fallbacks for missing data.
 * Returns relative time strings like "5m ago", "2h ago", "3d ago".
 * 
 * @param {string|Date} timestamp - Timestamp to format
 * @returns {string} Human-readable relative time string
 */
const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Unknown time'
  
  try {
    // Handle multiple timestamp field names and formats from different API responses
    const timeValue = timestamp || alert.created_at || alert.createdAt
    if (!timeValue) return 'Unknown time'
    
    const date = new Date(timeValue)
    if (isNaN(date.getTime())) return 'Invalid time'
    
    // Calculate time difference in minutes
    const now = new Date()
    const diffInMinutes = Math.floor((now - date) / (1000 * 60))
    
    // Return appropriate relative time format
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`           // Less than 1 hour
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`  // Less than 1 day
    return `${Math.floor(diffInMinutes / 1440)}d ago`                // Days ago
  } catch (error) {
    console.error('Error formatting timestamp:', error)
    return 'Unknown time'
  }
}

const getSeverityConfig = (severity) => {
  // Handle both numeric (1-4) and string severity levels
  let severityLevel;
  
  if (typeof severity === 'number') {
    // Map numeric severity to string levels
    switch (severity) {
      case 4:
        severityLevel = 'CRITICAL';
        break;
      case 3:
        severityLevel = 'HIGH';
        break;
      case 2:
        severityLevel = 'MEDIUM';
        break;
      case 1:
        severityLevel = 'LOW';
        break;
      default:
        severityLevel = 'UNKNOWN';
    }
  } else if (typeof severity === 'string') {
    severityLevel = severity.toUpperCase();
  } else {
    severityLevel = 'UNKNOWN';
  }

  switch (severityLevel) {
    case 'CRITICAL':
      return {
        bgGradient: 'from-disaster-red to-red-600',
        borderColor: 'border-disaster-red/50',
        textColor: 'text-disaster-red',
        badgeBg: 'bg-disaster-red',
        animate: true,
        label: 'CRITICAL'
      }
    case 'HIGH':
      return {
        bgGradient: 'from-disaster-orange to-orange-600',
        borderColor: 'border-disaster-orange/50',
        textColor: 'text-disaster-orange',
        badgeBg: 'bg-disaster-orange',
        animate: false,
        label: 'HIGH'
      }
    case 'MEDIUM':
      return {
        bgGradient: 'from-disaster-yellow to-yellow-600',
        borderColor: 'border-disaster-yellow/50',
        textColor: 'text-disaster-yellow',
        badgeBg: 'bg-disaster-yellow',
        animate: false,
        label: 'MEDIUM'
      }
    case 'LOW':
      return {
        bgGradient: 'from-disaster-blue to-blue-600',
        borderColor: 'border-disaster-blue/50',
        textColor: 'text-disaster-blue',
        badgeBg: 'bg-disaster-blue',
        animate: false,
        label: 'LOW'
      }
    default:
      return {
        bgGradient: 'from-gray-600 to-gray-700',
        borderColor: 'border-gray-500/50',
        textColor: 'text-gray-400',
        badgeBg: 'bg-gray-500',
        animate: false,
        label: 'UNKNOWN'
      }
  }
}

/**
 * Alert Card Component
 * 
 * Displays individual disaster alerts in a card format with severity indicators,
 * icons, timestamps, and interactive selection functionality.
 * 
 * Features:
 * - Dynamic severity-based styling and colors
 * - Disaster type-specific icons (wildfire, flood, earthquake, etc.)
 * - Timestamp formatting with fallback handling
 * - Hover effects and selection states
 * - Responsive design for mobile and desktop
 * 
 * @param {Object} props - Component props
 * @param {Object} props.alert - Alert data object
 * @param {Function} props.onSelect - Callback when alert is selected
 * @param {boolean} props.isSelected - Whether this alert is currently selected
 */
import { useState } from 'react'

export default function AlertCard({ alert, onSelect, isSelected, onClick, isLoading }) {
  const severityConfig = getSeverityConfig(alert.severity)
  const icon = getAlertIcon(alert.type || alert.disaster_type)
  const ts = alert.timestamp || alert.created_at || alert.createdAt

  return (
    <div
      onClick={onClick}
      className={`
        relative cursor-pointer transition-all duration-300 transform
        backdrop-filter backdrop-blur-md rounded-xl border shadow-lg
        hover:scale-105 hover:shadow-2xl
        ${isSelected 
          ? `bg-gradient-to-br ${severityConfig.bgGradient}/30 ${severityConfig.borderColor} border-2 scale-105 shadow-2xl` 
          : 'bg-white/10 border-white/20 hover:bg-white/20'
        }
        ${severityConfig.animate ? 'animate-pulse' : ''}
      `}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`p-2 bg-gradient-to-br ${severityConfig.bgGradient} rounded-lg text-white`}>
              {icon}
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold text-sm line-clamp-2">
                {alert.title || alert.description || 'Disaster Alert'}
              </h3>
            </div>
          </div>
          
          {/* Severity Badge */}
          <div className={`
            px-2 py-1 rounded-full text-xs font-bold text-white
            ${severityConfig.badgeBg}
            ${severityConfig.animate ? 'animate-pulse' : ''}
          `}>
            {severityConfig.label}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          {/* Location */}
          {alert.location && (
            <div className="flex items-center text-gray-300 text-xs">
              <MapPin className="w-3 h-3 mr-1" />
              <span className="truncate">{alert.location}</span>
            </div>
          )}

          {/* Description Preview */}
          <p className="text-gray-300 text-xs line-clamp-2">
            {alert.description || alert.summary || 'Emergency situation requiring immediate attention'}
          </p>

          {/* Timestamp */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center text-gray-400">
              <Clock className="w-3 h-3 mr-1" />
              <span>{formatTimestamp(ts)}</span>
            </div>
            
            {alert.affected_population && (
              <div className="text-gray-400">
                <span className="font-medium">{alert.affected_population}</span> affected
              </div>
            )}
          </div>
        </div>

        {/* Risk indicators */}
        {alert.risk_level && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Risk Level:</span>
              <span className={`font-semibold ${severityConfig.textColor}`}>
                {alert.risk_level}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className={`absolute -right-2 -top-2 w-4 h-4 rounded-full ${severityConfig.badgeBg} border-2 border-white`}>
          <div className="w-full h-full rounded-full bg-white/30 animate-ping"></div>
        </div>
      )}
    </div>
  )
}
