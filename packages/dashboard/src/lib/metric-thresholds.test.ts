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
})
