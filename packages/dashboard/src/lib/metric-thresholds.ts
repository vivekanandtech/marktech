// Sane defaults for the truth metrics, shown as a colored accent on their
// tiles. `higherIsBetter` is structural to each metric (not a business
// choice) and stays fixed; the good/bad numeric targets can be overridden
// per client from the admin panel (/admin/clients/:id → Settings) — see
// ClientSettings.thresholds in clientStore.ts.
export type MetricStatus = 'good' | 'watch' | 'bad'

interface Threshold {
  good: number
  bad: number
  higherIsBetter: boolean
}

export const THRESHOLDS: Record<string, Threshold> = {
  mer: { good: 3, bad: 1.5, higherIsBetter: true },
  attributedCPR: { good: 500, bad: 1500, higherIsBetter: false },
  nCAC: { good: 800, bad: 2000, higherIsBetter: false },
  overClaimMultiplier: { good: 1.5, bad: 3, higherIsBetter: false },
}

export function getMetricStatus(
  metricId: string,
  value: number,
  overrides?: Record<string, { good: number; bad: number }>
): MetricStatus | null {
  const base = THRESHOLDS[metricId]
  if (!base || value == null || !Number.isFinite(value) || value === 0) return null
  const t = { ...base, ...overrides?.[metricId] }
  if (t.higherIsBetter) return value >= t.good ? 'good' : value < t.bad ? 'bad' : 'watch'
  return value <= t.good ? 'good' : value > t.bad ? 'bad' : 'watch'
}

export const STATUS_DOT_CLASS: Record<MetricStatus, string> = {
  good: 'bg-emerald-500',
  watch: 'bg-amber-500',
  bad: 'bg-red-500',
}
