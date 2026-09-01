import { describe, it, expect } from 'vitest'
import { getMetricStatus } from './metric-thresholds'

describe('getMetricStatus', () => {
  it('MER: higher is better', () => {
    expect(getMetricStatus('mer', 4)).toBe('good')
    expect(getMetricStatus('mer', 2)).toBe('watch')
    expect(getMetricStatus('mer', 1)).toBe('bad')
  })

  it('Attributed CPR: lower is better (cost metric)', () => {
    expect(getMetricStatus('attributedCPR', 400)).toBe('good')
    expect(getMetricStatus('attributedCPR', 1000)).toBe('watch')
    expect(getMetricStatus('attributedCPR', 2000)).toBe('bad')
  })

  it('returns null for a metric with no defined threshold, rather than guessing', () => {
    expect(getMetricStatus('someRandomMetric', 5)).toBeNull()
  })

  it('returns null for 0 — treated as "no data" rather than a real bad reading', () => {
    expect(getMetricStatus('mer', 0)).toBeNull()
  })

  it('returns null for non-finite values rather than throwing', () => {
    expect(getMetricStatus('mer', NaN)).toBeNull()
    expect(getMetricStatus('mer', Infinity)).toBeNull()
  })

  it('a per-client override changes the result without mutating the default', () => {
    // Default: mer=2 is only "watch" (good=3, bad=1.5)
    expect(getMetricStatus('mer', 2)).toBe('watch')
    // Override this one client's target down — same raw value now reads "good"
    expect(getMetricStatus('mer', 2, { mer: { good: 2, bad: 1 } })).toBe('good')
    // Default behavior for other calls is untouched by the override object
    expect(getMetricStatus('mer', 2)).toBe('watch')
  })

  it('an override for a different metric than the one being read is ignored', () => {
    expect(getMetricStatus('mer', 2, { attributedCPR: { good: 1, bad: 1 } })).toBe('watch')
  })

  it('higherIsBetter direction stays fixed even when good/bad are overridden', () => {
    // attributedCPR is lower-is-better — overriding good/bad shouldn't flip that
    expect(getMetricStatus('attributedCPR', 100, { attributedCPR: { good: 200, bad: 900 } })).toBe('good')
    expect(getMetricStatus('attributedCPR', 1000, { attributedCPR: { good: 200, bad: 900 } })).toBe('bad')
  })
})
