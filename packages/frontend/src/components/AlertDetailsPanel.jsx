'use client'

import { useState } from 'react'
import { 
  MapPin, 
  Clock, 
  Users, 
  AlertTriangle, 
  Zap,
  ChevronRight,
  Loader2,
  Brain,
  CheckCircle2,
  XCircle
} from 'lucide-react'
import { getSeverityLabel, getSeverityClasses, severityMap } from '@/utils/severityUtils'
import ActionPlanDisplay from './ActionPlanDisplay'
import TimestampDisplay from './TimestampDisplay'

// Map disaster types to valid API values
const mapDisasterType = (type) => {
  const typeStr = String(type || '').toLowerCase()
  const typeMap = {
    'fire': 'wildfire',
    'wildfire': 'wildfire',
    'flooding': 'flood',
    'flood': 'flood',
    'earthquake': 'earthquake',
    'storm': 'cyclone',
    'tornado': 'cyclone',
    'cyclone': 'cyclone',
    'heat': 'heatwave',
    'heatwave': 'heatwave',
    'landslide': 'landslide',
    'power': 'other',
    'electrical': 'other'
  }
  return typeMap[typeStr] || 'other'
}

// Map severity levels to valid API values
const mapSeverity = (severity) => {
  const severityStr = String(severity || '').toLowerCase()
  const severityMap = {
    '1': 'low',
    '2': 'moderate', 
    '3': 'high',
    '4': 'critical',
    'low': 'low',
    'medium': 'moderate',
    'moderate': 'moderate',
    'high': 'high',
    'severe': 'severe',
    'critical': 'critical'
  }
  return severityMap[severityStr] || 'moderate'
}

export default function AlertDetailsPanel({ selectedAlert, isLoading }) {
  const [actionPlan, setActionPlan] = useState(null)
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false)
  const [planError, setPlanError] = useState(null)

  const generateActionPlan = async () => {
    if (!selectedAlert) return

    setIsGeneratingPlan(true)
    setPlanError(null)
    
    try {
      // Build a comprehensive query with fallbacks
      const query = [
        selectedAlert.description,
        selectedAlert.title,
        `A ${selectedAlert.type || 'disaster'} situation`,
        `Location: ${selectedAlert.location || 'unknown location'}`,
        `Severity: ${selectedAlert.severity || 'unknown'}`
      ].filter(Boolean).join('. ')

      if (!query.trim()) {
        throw new Error('Insufficient alert data to generate a response plan')
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/orchestrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          type: mapDisasterType(selectedAlert.type || selectedAlert.disaster_type || 'other'),
          location: selectedAlert.location || 'Unknown location',
          severity: mapSeverity(selectedAlert.severity || 'medium'),
          metadata: {
            timestamp: selectedAlert.timestamp || selectedAlert.created_at || new Date().toISOString(),
            alertId: selectedAlert.id,
            source: 'frontend_alert_panel'
          }
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setActionPlan(data.action_plan || data)
    } catch (error) {
      console.error('Error generating action plan:', error)
      setPlanError('Failed to generate action plan. Please try again.')
    } finally {
      setIsGeneratingPlan(false)
    }
  }

  if (!selectedAlert) {
    return (
      <div className="backdrop-filter backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 shadow-2xl h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-disaster-blue rounded-full flex items-center justify-center mb-4 mx-auto">
            <AlertTriangle className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Select an Alert</h3>
          <p className="text-gray-300">Choose an alert from the list to view detailed information and generate AI response plans.</p>
        </div>
      </div>
    )
  }

  const getSeverityColor = (severity) => {
    const sev = getSeverityLabel(severity)
    switch (sev) {
      case 'CRITICAL': return 'text-disaster-red'
      case 'HIGH': return 'text-disaster-orange'
      case 'MEDIUM': return 'text-disaster-yellow'
      case 'LOW': return 'text-disaster-blue'
      default: return 'text-gray-400'
    }
  }

  // Use the utility function from severityUtils
  const getSeverityBg = (severity) => getSeverityClasses(severity)

  return (
    <div className="backdrop-filter backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 shadow-2xl h-full flex flex-col">
      {/* Header */}
      <div className={`p-6 border-b border-white/20 ${getSeverityBg(selectedAlert.severity)} rounded-t-2xl`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-2">
              {selectedAlert.title || selectedAlert.description || 'Emergency Alert'}
            </h2>
            <div className="flex items-center space-x-4 text-sm">
              <span className={`px-3 py-1 rounded-full font-semibold ${getSeverityColor(selectedAlert.severity)}`}>
                ● {getSeverityLabel(selectedAlert.severity)} PRIORITY
              </span>
              {selectedAlert.type && (
                <span className="text-gray-300">
                  {selectedAlert.type.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          
          {isLoading && (
            <Loader2 className="w-6 h-6 text-disaster-blue animate-spin" />
          )}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {selectedAlert.location && (
            <div className="flex items-center space-x-2 text-gray-300">
              <MapPin className="w-4 h-4" />
              <span className="text-sm truncate">{selectedAlert.location}</span>
            </div>
          )}
          
          <div className="flex items-center space-x-2 text-gray-300">
            <Clock className="w-4 h-4" />
            <span className="text-sm">
              <TimestampDisplay timestamp={selectedAlert.timestamp || selectedAlert.created_at} />
            </span>
          </div>
          
          {selectedAlert.affected_population && (
            <div className="flex items-center space-x-2 text-gray-300">
              <Users className="w-4 h-4" />
              <span className="text-sm">{selectedAlert.affected_population} affected</span>
            </div>
          )}
          
          {selectedAlert.risk_level && (
            <div className="flex items-center space-x-2 text-gray-300">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">Risk: {selectedAlert.risk_level}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Alert Details */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-disaster-orange" />
            Situation Details
          </h3>
          
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-gray-300 leading-relaxed">
              {selectedAlert.description || selectedAlert.summary || 'No detailed description available.'}
            </p>
          </div>

          {/* Additional info if available */}
          {(selectedAlert.estimated_impact || selectedAlert.resources_needed || selectedAlert.priority_actions) && (
            <div className="grid md:grid-cols-2 gap-4">
              {selectedAlert.estimated_impact && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <h4 className="font-semibold text-white mb-2">Estimated Impact</h4>
                  <p className="text-gray-300 text-sm">{selectedAlert.estimated_impact}</p>
                </div>
              )}
              
              {selectedAlert.resources_needed && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <h4 className="font-semibold text-white mb-2">Resources Needed</h4>
                  <p className="text-gray-300 text-sm">{selectedAlert.resources_needed}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Action Plan Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <Brain className="w-5 h-5 mr-2 text-disaster-blue" />
              AI Action Plan
            </h3>
            
            <button
              onClick={generateActionPlan}
              disabled={isGeneratingPlan}
              className={`
                flex items-center space-x-2 px-6 py-3 rounded-xl font-semibold transition-all duration-300
                ${isGeneratingPlan 
                  ? 'bg-gray-600 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-disaster-blue to-purple-600 hover:from-disaster-blue/80 hover:to-purple-600/80 hover:scale-105 hover:shadow-xl'
                }
                text-white shadow-lg
              `}
            >
              {isGeneratingPlan ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Generate Plan</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Action Plan Display */}
          {planError && (
            <div className="bg-disaster-red/20 border border-disaster-red/50 rounded-xl p-4 flex items-center space-x-3">
              <XCircle className="w-5 h-5 text-disaster-red flex-shrink-0" />
              <p className="text-disaster-red">{planError}</p>
            </div>
          )}

          {actionPlan && !isGeneratingPlan && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-4 mb-4 flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
              <p className="text-green-400">AI action plan generated successfully</p>
            </div>
          )}

          {actionPlan ? (
            <ActionPlanDisplay actionPlan={actionPlan} />
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
              <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-300 mb-2">No action plan generated yet</p>
              <p className="text-gray-500 text-sm">
                Click "Generate Plan" to create an AI-powered response strategy for this emergency.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
