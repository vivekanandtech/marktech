// Sane default targets for the new truth metrics, shown as a colored accent
// on their tiles. Deliberately hardcoded for now — making these configurable
// per-client is a real feature (a Settings-page target editor) that belongs
// in its own pass, not bundled into this one.
export type MetricStatus = 'good' | 'watch' | 'bad'

interface Threshold {
  good: number
  bad: number
  higherIsBetter: boolean
}

const THRESHOLDS: Record<string, Threshold> = {
  mer: { good: 3, bad: 1.5, higherIsBetter: true },
  attributedCPR: { good: 500, bad: 1500, higherIsBetter: false },
  nCAC: { good: 800, bad: 2000, higherIsBetter: false },
  overClaimMultiplier: { good: 1.5, bad: 3, higherIsBetter: false },
}

export function getMetricStatus(metricId: string, value: number): MetricStatus | null {
  const t = THRESHOLDS[metricId]
  if (!t || value == null || !Number.isFinite(value) || value === 0) return null
  if (t.higherIsBetter) return value >= t.good ? 'good' : value < t.bad ? 'bad' : 'watch'
  return value <= t.good ? 'good' : value > t.bad ? 'bad' : 'watch'
}

export const STATUS_DOT_CLASS: Record<MetricStatus, string> = {
  good: 'bg-emerald-500',
  watch: 'bg-amber-500',
  bad: 'bg-red-500',
}
