'use client'

import { 
  CheckCircle, 
  Clock, 
  Users, 
  Truck, 
  AlertTriangle, 
  Target,
  TrendingUp,
  FileText,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { useState } from 'react'
import LiveTime from './LiveTime'

export default function ActionPlanDisplay({ actionPlan }) {
  const [expandedSections, setExpandedSections] = useState({
    situation: true,
    immediate: true,
    resources: false,
    timeline: false,
    coordination: false
  })

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  if (!actionPlan || !actionPlan.action_plan) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-300">Invalid action plan data</p>
      </div>
    )
  }

  const plan = actionPlan.action_plan

  const SectionHeader = ({ title, icon: Icon, sectionKey, count }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between p-4 bg-white/10 hover:bg-white/15 rounded-lg transition-all duration-200"
    >
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-gradient-to-br from-disaster-blue to-purple-600 rounded-lg">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="text-left">
          <h4 className="font-semibold text-white">{title}</h4>
          {count && <p className="text-xs text-gray-400">{count} items</p>}
        </div>
      </div>
      {expandedSections[sectionKey] ? (
        <ChevronDown className="w-4 h-4 text-gray-400" />
      ) : (
        <ChevronRight className="w-4 h-4 text-gray-400" />
      )}
    </button>
  )

  return (
    <div className="space-y-4">
      {/* Response Time and Risk Level */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <Clock className="w-5 h-5 text-disaster-blue" />
            <div>
              <p className="text-sm text-gray-400">Response Time</p>
              <p className="font-semibold text-white">
                {actionPlan.response_time || 'N/A'}ms
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <TrendingUp className="w-5 h-5 text-disaster-orange" />
            <div>
              <p className="text-sm text-gray-400">Risk Level</p>
              <p className={`font-semibold ${
                actionPlan.risk_level === 'CRITICAL' ? 'text-disaster-red' :
                actionPlan.risk_level === 'HIGH' ? 'text-disaster-orange' :
                actionPlan.risk_level === 'MEDIUM' ? 'text-disaster-yellow' :
                'text-disaster-blue'
              }`}>
                {actionPlan.risk_level || 'UNKNOWN'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Situation Assessment */}
      <div className="space-y-2">
        <SectionHeader 
          title="Situation Assessment" 
          icon={AlertTriangle} 
          sectionKey="situation"
        />
        {expandedSections.situation && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 ml-4">
            <p className="text-gray-300 leading-relaxed">
              {plan.situation_assessment || 'No situation assessment available.'}
            </p>
          </div>
        )}
      </div>

      {/* Immediate Actions */}
      <div className="space-y-2">
        <SectionHeader 
          title="Immediate Actions" 
          icon={Target} 
          sectionKey="immediate"
          count={plan.immediate_actions?.length}
        />
        {expandedSections.immediate && (
          <div className="space-y-3 ml-4">
            {plan.immediate_actions?.length > 0 ? (
              plan.immediate_actions.map((action, index) => (
                <div key={index} className="flex items-start space-x-3 bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-6 h-6 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{index + 1}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium mb-1">{action.action || action}</p>
                    {action.priority && (
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                        action.priority === 'HIGH' ? 'bg-disaster-red text-white' :
                        action.priority === 'MEDIUM' ? 'bg-disaster-orange text-white' :
                        'bg-disaster-blue text-white'
                      }`}>
                        {action.priority} Priority
                      </span>
                    )}
                    {action.timeline && (
                      <p className="text-gray-400 text-sm mt-1">Timeline: {action.timeline}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-gray-400">No immediate actions specified.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resource Requirements */}
      <div className="space-y-2">
        <SectionHeader 
          title="Resource Requirements" 
          icon={Truck} 
          sectionKey="resources"
          count={plan.resource_requirements?.length}
        />
        {expandedSections.resources && (
          <div className="space-y-3 ml-4">
            {plan.resource_requirements?.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-3">
                {plan.resource_requirements.map((resource, index) => (
                  <div key={index} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center space-x-3">
                      <Truck className="w-4 h-4 text-disaster-blue flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-white font-medium">{resource.type || resource}</p>
                        {resource.quantity && (
                          <p className="text-gray-400 text-sm">Quantity: {resource.quantity}</p>
                        )}
                        {resource.urgency && (
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold mt-1 ${
                            resource.urgency === 'IMMEDIATE' ? 'bg-disaster-red text-white' :
                            resource.urgency === 'URGENT' ? 'bg-disaster-orange text-white' :
                            'bg-disaster-yellow text-black'
                          }`}>
                            {resource.urgency}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                <p className="text-gray-400">No specific resource requirements listed.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timeline */}
      {plan.timeline && (
        <div className="space-y-2">
          <SectionHeader 
            title="Response Timeline" 
            icon={Clock} 
            sectionKey="timeline"
          />
          {expandedSections.timeline && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 ml-4">
              <p className="text-gray-300">{plan.timeline}</p>
            </div>
          )}
        </div>
      )}

      {/* Coordination Requirements */}
      {plan.coordination_requirements && (
        <div className="space-y-2">
          <SectionHeader 
            title="Coordination Requirements" 
            icon={Users} 
            sectionKey="coordination"
          />
          {expandedSections.coordination && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 ml-4">
              <p className="text-gray-300">{plan.coordination_requirements}</p>
            </div>
          )}
        </div>
      )}

      {/* Additional Information */}
      {plan.additional_considerations && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h4 className="font-semibold text-white mb-2 flex items-center">
            <FileText className="w-4 h-4 mr-2 text-disaster-yellow" />
            Additional Considerations
          </h4>
          <p className="text-gray-300 text-sm">{plan.additional_considerations}</p>
        </div>
      )}

      {/* Plan Metadata */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-400">Generated</p>
            <p className="text-white font-medium"><LiveTime /></p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Request ID</p>
            <p className="text-white font-mono text-xs">{actionPlan.request_id?.slice(-8) || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Cached</p>
            <p className="text-white font-medium">{actionPlan.cached ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Actions</p>
            <p className="text-white font-medium">{plan.immediate_actions?.length || 0}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
