'use client'

import { useEffect, useState } from 'react'

export default function TimestampDisplay({ timestamp, formatOptions }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!timestamp) {
      setLabel('Unknown time')
      return
    }
    const dt = new Date(timestamp)
    setLabel(
      formatOptions
        ? dt.toLocaleString(undefined, formatOptions)
        : dt.toLocaleString()
    )
  }, [timestamp, formatOptions])

  return <span>{label}</span>
}
