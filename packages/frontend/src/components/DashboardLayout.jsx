'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Shield, Zap } from 'lucide-react'
import SearchBar from './SearchBar'
import AlertsList from './AlertsList'
import AlertDetailsPanel from './AlertDetailsPanel'

export default function DashboardLayout({ initialAlerts, searchParams }) {
  const [alerts, setAlerts] = useState(initialAlerts || [])
  const [filteredAlerts, setFilteredAlerts] = useState(initialAlerts || [])
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [searchResults, setSearchResults] = useState(null)
  const [searchError, setSearchError] = useState(null)
  const [isSearching, setIsSearching] = useState(false)

  // Server-Sent Events for real-time alerts
  useEffect(() => {
    const connectToAlertStream = () => {
      const eventSource = new EventSource(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/alerts/stream`)
      
      eventSource.onopen = () => {
        setConnectionStatus('connected')
        console.log('Alert stream connected')
      }
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          switch (data.type) {
            case 'connected':
              setConnectionStatus('connected')
              break
            case 'alert':
              setAlerts(prevAlerts => {
                // Check if alert already exists to avoid duplicates
                const exists = prevAlerts.some(alert => alert.id === data.data.id)
                if (!exists) {
                  return [data.data, ...prevAlerts]
                }
                return prevAlerts
              })
              break
            case 'heartbeat':
              // Keep connection alive
              break
            default:
              console.log('Unknown SSE message type:', data.type)
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error)
        }
      }
      
      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error)
        setConnectionStatus('error')
        eventSource.close()
        
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          if (eventSource.readyState === EventSource.CLOSED) {
            connectToAlertStream()
          }
        }, 5000)
      }
      
      return eventSource
    }

    const eventSource = connectToAlertStream()
    
    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [])

  // Update filtered alerts when search results change
  useEffect(() => {
    if (searchResults) {
      setFilteredAlerts(searchResults.data || [])
    } else {
      setFilteredAlerts(alerts)
    }
  }, [searchResults, alerts])

  // Search handlers
  const handleSearchResults = (results) => {
    setSearchResults(results)
  }

  const handleSearchError = (error) => {
    setSearchError(error)
  }

  const handleSearchLoading = (loading) => {
    setIsSearching(loading)
  }

  // Fetch detailed alert data when selected
  const handleAlertSelect = async (alert) => {
    setIsLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/alerts/${alert.id}`)
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
      {/* Global Error Banner */}
      {(connectionStatus === 'error' || searchError) && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-disaster-red/90 backdrop-filter backdrop-blur-md text-white p-4 rounded-xl border border-disaster-red/50 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-white" />
              <div>
                <p className="font-semibold">System Alert</p>
                <p className="text-sm opacity-90">
                  {connectionStatus === 'error' && 'Backend connection failed. '}
                  {searchError && `Search error: ${searchError}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (searchError) setSearchError(null)
              }}
              className="text-white/70 hover:text-white transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}

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
          
          <SearchBar 
            onSearchResults={handleSearchResults}
            onSearchError={handleSearchError}
            onSearchLoading={handleSearchLoading}
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-240px)]">
        {/* Alerts List */}
        <div className="lg:col-span-1">
          <AlertsList 
            alerts={filteredAlerts} 
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
