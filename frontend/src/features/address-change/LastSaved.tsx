import { useEffect, useState } from 'react'
import type { FC } from 'react'

const TAG_DURATION_MS = 3000

export function formatLastSaved(savedAt: Date, now: Date = new Date()): string {
  const sameDay = savedAt.toDateString() === now.toDateString()
  if (sameDay) {
    const time = savedAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    return `Last saved at ${time}`
  }
  const date = savedAt.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
  return `Last saved on ${date}`
}

type Props = {
  savedAt: Date | null
}

/** Shows a "Progress saved" tag that shrinks into a save-icon circle beside a last-saved label. */
const LastSaved: FC<Props> = ({ savedAt }) => {
  const [collapsed, setCollapsed] = useState(false)
  const savedTime = savedAt?.getTime()

  useEffect(() => {
    if (savedTime === undefined) return
    setCollapsed(false)
    const timer = window.setTimeout(() => setCollapsed(true), TAG_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [savedTime])

  if (!savedAt) return null

  return (
    <output className="last-saved">
      <span className={`last-saved-tag${collapsed ? ' collapsed' : ''}`}>
        <span aria-hidden={collapsed} className="last-saved-tag-text">
          Progress saved
        </span>
        <i aria-hidden="true" className="bi bi-check-lg last-saved-icon" />
      </span>
      <span className="last-saved-label">{formatLastSaved(savedAt)}</span>
    </output>
  )
}

export default LastSaved
