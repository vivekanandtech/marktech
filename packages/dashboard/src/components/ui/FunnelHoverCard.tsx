import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MetaFunnelCounts } from '@/lib/meta-transform'
import { formatNumber } from '@/lib/formatters'

const CLOSE_DELAY_MS = 150
const POPOVER_WIDTH = 250

// Matches Meta Ads Manager's own "hover the result to see the funnel" pattern
// — wraps a campaign/ad set/ad's ROAS cell and reveals the underlying website
// funnel (add payment info / add to cart / checkout initiated / purchases)
// already fetched via meta-actions.ts, without adding a permanent column.
const FUNNEL_ROWS: { key: keyof MetaFunnelCounts; label: string }[] = [
  { key: 'addPaymentInfo',   label: 'Website adds of payment info' },
  { key: 'addToCart',        label: 'Website adds to cart' },
  { key: 'initiateCheckout', label: 'Website checkouts initiated' },
  { key: 'purchases',        label: 'Website purchases' },
]

export function FunnelHoverCard({ funnel, children }: { funnel?: MetaFunnelCounts; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const clearCloseTimer = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }
  const scheduleClose = () => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }
  const showNow = () => {
    clearCloseTimer()
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      let left = rect.left
      if (left + POPOVER_WIDTH > window.innerWidth - 12) left = window.innerWidth - POPOVER_WIDTH - 12
      setPos({ top: rect.bottom + 6, left: Math.max(12, left) })
    }
    setOpen(true)
  }

  useEffect(() => () => clearCloseTimer(), [])

  // No funnel data (Google rows, or Meta rows with no insights yet) — render
  // the value plainly, no hover affordance implying data that isn't there.
  if (!funnel) return <>{children}</>

  return (
    <span ref={ref} onMouseEnter={showNow} onMouseLeave={scheduleClose} className="cursor-help">
      {children}
      {open && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH, zIndex: 100 }}
          className="rounded-lg border border-theme bg-surface shadow-xl p-3 text-xs animate-fade-in"
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <p className="font-semibold text-[10px] uppercase tracking-wide t3 mb-2">Website funnel</p>
          <div className="space-y-1.5">
            {FUNNEL_ROWS.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3">
                <span className="t2">{row.label}</span>
                <span className="font-semibold t1">{formatNumber(funnel[row.key])}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </span>
  )
}
