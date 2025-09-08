'use client'

import { useState } from 'react'
import AlertCard from './AlertCard'
import { AlertCircle, Clock, Loader2 } from 'lucide-react'
import LiveTime from './LiveTime'

export default function AlertsList({ alerts, onAlertSelect, selectedAlert, isLoading }) {
  const [sortBy, setSortBy] = useState('timestamp') // timestamp, severity, location
  const [filterBy, setFilterBy] = useState('all') // all, critical, high, medium, low
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(20)

  // Sort alerts based on selected criteria
  const sortedAlerts = [...alerts].sort((a, b) => {
    switch (sortBy) {
      case 'severity':
        const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 }
        return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0)
      case 'location':
        return (a.location || '').localeCompare(b.location || '')
      default: // timestamp
        return new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at)
    }
  })

  // Filter alerts
  const filteredAlerts = sortedAlerts.filter(alert => {
    if (filterBy === 'all') return true
    return (alert.severity || '').toLowerCase() === filterBy.toLowerCase()
  })

  // Pagination
  const totalPages = Math.ceil(filteredAlerts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedAlerts = filteredAlerts.slice(startIndex, startIndex + itemsPerPage)

  // Reset to first page when filters change
  const handleFilterChange = (newFilter) => {
    setFilterBy(newFilter)
    setCurrentPage(1)
  }

  const handleSortChange = (newSort) => {
    setSortBy(newSort)
    setCurrentPage(1)
  }

  if (alerts.length === 0) {
    return (
      <div className="backdrop-filter backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 p-8 shadow-2xl h-full flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-disaster-blue to-purple-600 rounded-full flex items-center justify-center mb-4 mx-auto">
            <AlertCircle className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Active Alerts</h3>
          <p className="text-gray-300 mb-4">The system is monitoring for new disasters.</p>
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-400">
            <Clock className="w-4 h-4" />
            <span>Last updated: <LiveTime /></span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="backdrop-filter backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 shadow-2xl h-full flex flex-col">
      {/* Header with controls */}
      <div className="p-6 border-b border-white/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 text-disaster-orange" />
            Active Alerts ({filteredAlerts.length})
          </h2>
          {isLoading && selectedAlert && (
            <Loader2 className="w-5 h-5 text-disaster-blue animate-spin" />
          )}
        </div>
        
        {/* Sort and Filter Controls */}
        <div className="flex space-x-3">
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-disaster-blue"
          >
            <option value="timestamp">Latest First</option>
            <option value="severity">By Severity</option>
            <option value="location">By Location</option>
          </select>
          
          <select
            value={filterBy}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-disaster-blue"
          >
            <option value="all">All Levels</option>
            <option value="critical">Critical Only</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      {/* Alerts List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {paginatedAlerts.map((alert, index) => (
          <AlertCard
            key={alert.id || index}
            alert={alert}
            isSelected={selectedAlert?.id === alert.id}
            onClick={() => onAlertSelect(alert)}
            isLoading={isLoading && selectedAlert?.id === alert.id}
          />
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-white/20">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-300">
              Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredAlerts.length)} of {filteredAlerts.length} alerts
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-gray-300">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
