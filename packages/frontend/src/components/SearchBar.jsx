'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, X, Loader2 } from 'lucide-react'

export default function SearchBar({ onSearchResults, onSearchError, onSearchLoading }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()

  // Initialize search term from URL
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setSearchTerm(q)
    }
  }, [searchParams])

  // Perform actual search when query changes
  useEffect(() => {
    const performSearch = async (query) => {
      if (!query.trim()) {
        onSearchResults?.(null)
        return
      }

      setIsSearching(true)
      onSearchLoading?.(true)
      
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/search?q=${encodeURIComponent(query)}`)
        
        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`)
        }
        
        const data = await response.json()
        onSearchResults?.(data)
        onSearchError?.(null)
      } catch (error) {
        console.error('Search error:', error)
        onSearchError?.(error.message)
        onSearchResults?.(null)
      } finally {
        setIsSearching(false)
        onSearchLoading?.(false)
      }
    }

    const delayedSearch = setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      
      if (searchTerm.trim()) {
        params.set('q', searchTerm.trim())
        performSearch(searchTerm.trim())
      } else {
        params.delete('q')
        onSearchResults?.(null)
      }
      
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`
      router.replace(newUrl)
    }, 300)

    return () => clearTimeout(delayedSearch)
  }, [searchTerm, searchParams, router, onSearchResults, onSearchError, onSearchLoading])

  const clearSearch = () => {
    setSearchTerm('')
    const params = new URLSearchParams(searchParams)
    params.delete('q')
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`
    router.replace(newUrl)
  }

  return (
    <div className="relative">
      <div className={`relative transition-all duration-300 ${isFocused ? 'scale-105' : ''}`}>
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className={`w-5 h-5 transition-colors duration-200 ${isFocused ? 'text-disaster-blue' : 'text-gray-400'}`} />
        </div>
        
        <input
          type="text"
          placeholder="Search disasters, locations, or keywords..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={isSearching}
          className={`
            w-full pl-12 pr-12 py-4 
            bg-white/10 backdrop-filter backdrop-blur-md
            border border-white/20 rounded-xl
            text-white placeholder-gray-300
            focus:outline-none focus:ring-2 focus:ring-disaster-blue focus:border-transparent
            transition-all duration-300
            ${isFocused ? 'bg-white/20 shadow-2xl' : 'hover:bg-white/15'}
            ${isSearching ? 'opacity-75 cursor-not-allowed' : ''}
          `}
        />
        
        {isSearching ? (
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
            <Loader2 className="w-5 h-5 text-disaster-blue animate-spin" />
          </div>
        ) : searchTerm ? (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        ) : null}
      </div>
      
      {/* Search suggestions or filters could go here */}
      {isFocused && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/10 backdrop-filter backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-2xl opacity-0 animate-fade-in">
          <div className="text-sm text-gray-300 mb-2">Quick Filters:</div>
          <div className="flex flex-wrap gap-2">
            {['Earthquake', 'Wildfire', 'Flood', 'Critical', 'High Priority'].map((filter) => (
              <button
                key={filter}
                onClick={() => setSearchTerm(filter)}
                className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full text-xs text-white border border-white/20 transition-all duration-200 hover:scale-105"
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
