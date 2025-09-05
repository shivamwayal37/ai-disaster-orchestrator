'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Shield, Zap } from 'lucide-react'
import SearchBar from './SearchBar'
import AlertsList from './AlertsList'
import AlertDetailsPanel from './AlertDetailsPanel'

export default function DashboardLayout({ initialAlerts, searchParams }) {
  const [alerts, setAlerts] = useState(initialAlerts || [])
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting')

  // Polling for new alerts
  useEffect(() => {
    const pollAlerts = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'}/api/alerts`)
        if (res.ok) {
          const data = await res.json()
          setAlerts(data.data || [])
          setConnectionStatus('connected')
        } else {
          setConnectionStatus('error')
        }
      } catch (error) {
        console.error('Polling error:', error)
        setConnectionStatus('error')
      }
    }

    // Initial connection test
    pollAlerts()
    
    // Poll every 10 seconds
    const interval = setInterval(pollAlerts, 10000)
    
    return () => clearInterval(interval)
  }, [])

  // Fetch detailed alert data when selected
  const handleAlertSelect = async (alert) => {
    setIsLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'}/api/alerts/${alert.id}`)
      if (res.ok) {
        const detailedAlert = await res.json()
        setSelectedAlert(detailedAlert)
      } else {
        setSelectedAlert(alert) // Fallback to basic data
      }
    } catch (error) {
      console.error('Error fetching alert details:', error)
      setSelectedAlert(alert) // Fallback to basic data
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-400'
      case 'error': return 'text-disaster-red'
      default: return 'text-disaster-yellow'
    }
  }

  return (
    <div className="relative z-10 min-h-screen p-4 lg:p-8">
      {/* Header */}
      <header className="mb-8">
        <div className="backdrop-filter backdrop-blur-md bg-white/10 rounded-2xl border border-white/20 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-br from-disaster-red to-disaster-orange rounded-xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  AI Disaster Response
                </h1>
                <p className="text-gray-300">Intelligent Emergency Coordination</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-400 animate-pulse' : connectionStatus === 'error' ? 'bg-disaster-red' : 'bg-disaster-yellow animate-pulse'}`}></div>
                <span className={`text-sm font-medium ${getStatusColor()}`}>
                  {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'error' ? 'Disconnected' : 'Connecting...'}
                </span>
              </div>
              
              <div className="flex items-center space-x-2 bg-white/10 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-disaster-yellow" />
                <span className="text-white font-semibold">{alerts.length}</span>
                <span className="text-gray-300 text-sm">Active</span>
              </div>
            </div>
          </div>
          
          <SearchBar />
        </div>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-240px)]">
        {/* Alerts List */}
        <div className="lg:col-span-1">
          <AlertsList 
            alerts={alerts} 
            onAlertSelect={handleAlertSelect}
            selectedAlert={selectedAlert}
            isLoading={isLoading}
          />
        </div>

        {/* Alert Details Panel */}
        <div className="lg:col-span-2">
          <AlertDetailsPanel 
            selectedAlert={selectedAlert}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  )
}
