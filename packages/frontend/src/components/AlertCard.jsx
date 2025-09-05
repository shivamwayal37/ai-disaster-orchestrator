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
  Loader2
} from 'lucide-react'
import LiveRelativeTime from './LiveRelativeTime'

const getAlertIcon = (type) => {
  const iconClass = "w-5 h-5"
  switch (type?.toLowerCase()) {
    case 'wildfire':
    case 'fire':
      return <Flame className={iconClass} />
    case 'flood':
    case 'flooding':
      return <Droplets className={iconClass} />
    case 'earthquake':
      return <Mountain className={iconClass} />
    case 'storm':
    case 'tornado':
      return <Wind className={iconClass} />
    case 'power':
    case 'electrical':
      return <Zap className={iconClass} />
    default:
      return <AlertTriangle className={iconClass} />
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

// Timestamp is rendered via client-only component to avoid SSR/client mismatch

export default function AlertCard({ alert, isSelected, onClick, isLoading }) {
  const severityConfig = getSeverityConfig(alert.severity)
  const icon = getAlertIcon(alert.type || alert.disaster_type)
  const ts = alert.timestamp || alert.created_at

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
              <span><LiveRelativeTime timestamp={ts} /></span>
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
