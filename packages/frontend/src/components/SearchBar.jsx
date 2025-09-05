'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

export default function SearchBar() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()

  // Initialize search term from URL
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
      setSearchTerm(q)
    }
  }, [searchParams])

  // Debounced search
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      
      if (searchTerm.trim()) {
        params.set('q', searchTerm.trim())
      } else {
        params.delete('q')
      }
      
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`
      router.replace(newUrl)
    }, 300)

    return () => clearTimeout(delayedSearch)
  }, [searchTerm, searchParams, router])

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
          className={`
            w-full pl-12 pr-12 py-4 
            bg-white/10 backdrop-filter backdrop-blur-md
            border border-white/20 rounded-xl
            text-white placeholder-gray-300
            focus:outline-none focus:ring-2 focus:ring-disaster-blue focus:border-transparent
            transition-all duration-300
            ${isFocused ? 'bg-white/20 shadow-2xl' : 'hover:bg-white/15'}
          `}
        />
        
        {searchTerm && (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        )}
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
