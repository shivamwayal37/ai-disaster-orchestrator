'use client'

import { useEffect, useState } from 'react'

function computeRelative(ts) {
  if (!ts) return 'Unknown time'
  const date = new Date(ts)
  const now = new Date()
  const diffInMinutes = Math.floor((now - date) / (1000 * 60))
  if (diffInMinutes < 1) return 'Just now'
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
  return date.toLocaleDateString()
}

export default function LiveRelativeTime({ timestamp, intervalMs = 60000 }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    const update = () => setLabel(computeRelative(timestamp))
    update()
    const id = setInterval(update, intervalMs)
    return () => clearInterval(id)
  }, [timestamp, intervalMs])

  return <span>{label}</span>
}
