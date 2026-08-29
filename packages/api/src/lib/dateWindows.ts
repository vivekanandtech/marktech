// Shared "current period vs. immediately-preceding period" window math, used
// by the metrics engine and any campaign-tree trend computation. Keeping this
// in one place avoids each service (Meta/Google/Shopify) computing period
// boundaries slightly differently.

export interface DateWindow {
  since: string  // YYYY-MM-DD
  until: string  // YYYY-MM-DD
}

const DAYS_MAP: Record<string, number> = {
  '1D': 1, '3D': 3, '7D': 7, '14D': 14, '30D': 30, '3M': 90, '6M': 180, '1Y': 365,
}

export function daysForRange(dateRange: string): number {
  return DAYS_MAP[dateRange] ?? (parseInt(dateRange.replace(/\D/g, ''), 10) || 30)
}

const fmt = (d: Date) => d.toISOString().slice(0, 10)

export function currentWindow(dateRange: string): DateWindow {
  const days = daysForRange(dateRange)
  const until = new Date()
  const since = new Date(until)
  since.setDate(since.getDate() - (days - 1))
  return { since: fmt(since), until: fmt(until) }
}

// The equal-length window immediately before currentWindow — e.g. for "30D",
// if current is day -29..day 0, previous is day -59..day -30.
export function previousWindow(dateRange: string): DateWindow {
  const days = daysForRange(dateRange)
  const until = new Date()
  until.setDate(until.getDate() - days)
  const since = new Date(until)
  since.setDate(since.getDate() - (days - 1))
  return { since: fmt(since), until: fmt(until) }
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}
