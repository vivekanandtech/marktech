import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { useMetricDefinitions } from '@/hooks/useMetricDefinitions'

const CLOSE_DELAY_MS = 150
const POPOVER_WIDTH = 280

// Replaces the old click-to-open sidebar drawer: a small icon that reveals
// the metric's definition/formula/caveat in a compact popover on hover
// (desktop) or tap (touch), right where the number already is. Portaled to
// <body> so it isn't clipped by any ancestor card's overflow:hidden.
export function MetricInfoTooltip({ metricId, size = 'md' }: { metricId: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const data = useMetricDefinitions()
  const metric = metricId ? data?.definitions[metricId] : null

  const clearCloseTimer = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }
  const scheduleClose = () => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }
  const showNow = () => {
    clearCloseTimer()
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      let left = rect.left
      if (left + POPOVER_WIDTH > window.innerWidth - 12) left = window.innerWidth - POPOVER_WIDTH - 12
      setPos({ top: rect.bottom + 6, left: Math.max(12, left) })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClickOutside = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [open])

  useEffect(() => () => clearCloseTimer(), [])

  if (!metric) return null

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={showNow}
        onMouseLeave={scheduleClose}
        onClick={(e) => { e.stopPropagation(); open ? setOpen(false) : showNow() }}
        className={clsxSize(size)}
        aria-label={`About ${metric.label}`}
        title=""
      >
        <Info size={size === 'sm' ? 10 : 11} />
      </button>
      {open && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH, zIndex: 100 }}
          className="rounded-lg border border-theme bg-surface shadow-xl p-3 text-xs animate-fade-in"
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <p className="font-semibold t1 mb-1">{metric.label}</p>
          <p className="t2 leading-relaxed mb-2">{metric.definition}</p>
          <pre className="font-mono t1 bg-surface-2 border border-theme rounded p-2 whitespace-pre-wrap text-[10px] leading-relaxed mb-2">
            {metric.formula}
          </pre>
          {metric.caveat && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">⚠ {metric.caveat}</p>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

function clsxSize(size: 'sm' | 'md') {
  return [
    'flex items-center justify-center rounded-full border border-theme t3 hover:t1 hover:border-indigo-500/40 transition-colors shrink-0',
    size === 'sm' ? 'w-4 h-4' : 'w-[18px] h-[18px]',
  ].join(' ')
}
