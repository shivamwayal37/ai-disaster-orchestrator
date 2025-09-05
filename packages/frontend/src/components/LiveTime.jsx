'use client'

import { useEffect, useState } from 'react'

export default function LiveTime({ intervalMs = 1000, formatOptions }) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(
        formatOptions
          ? now.toLocaleTimeString(undefined, formatOptions)
          : now.toLocaleTimeString()
      )
    }

    updateTime()
    const id = setInterval(updateTime, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, formatOptions])

  return <span>{time}</span>
}
