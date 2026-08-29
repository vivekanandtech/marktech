import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { daysForRange, currentWindow, previousWindow, pctChange } from './dateWindows'

describe('daysForRange', () => {
  it('maps known presets to day counts', () => {
    expect(daysForRange('1D')).toBe(1)
    expect(daysForRange('7D')).toBe(7)
    expect(daysForRange('30D')).toBe(30)
    expect(daysForRange('3M')).toBe(90)
    expect(daysForRange('1Y')).toBe(365)
  })

  it('parses arbitrary "NNd"-style ranges not in the preset map', () => {
    expect(daysForRange('45D')).toBe(45)
  })

  it('defaults to 30 for unparseable input', () => {
    expect(daysForRange('garbage')).toBe(30)
  })
})

describe('currentWindow / previousWindow', () => {
  // Freeze "today" so window boundaries are deterministic.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-30T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('current window for 30D spans the last 30 days ending today', () => {
    const w = currentWindow('30D')
    expect(w.until).toBe('2026-08-30')
    expect(w.since).toBe('2026-08-01') // 30 days inclusive of today
  })

  it('previous window is the equal-length window immediately before current', () => {
    const current = currentWindow('30D')
    const previous = previousWindow('30D')
    // previous.until must be exactly one day before current.since — no gap, no overlap
    const dayBeforeCurrentSince = new Date(current.since)
    dayBeforeCurrentSince.setUTCDate(dayBeforeCurrentSince.getUTCDate() - 1)
    expect(previous.until).toBe(dayBeforeCurrentSince.toISOString().slice(0, 10))
  })

  it('previous window has the same length in days as current window', () => {
    for (const range of ['7D', '30D', '90D']) {
      const cur = currentWindow(range)
      const prev = previousWindow(range)
      const curDays = (new Date(cur.until).getTime() - new Date(cur.since).getTime()) / 86_400_000
      const prevDays = (new Date(prev.until).getTime() - new Date(prev.since).getTime()) / 86_400_000
      expect(prevDays).toBe(curDays)
    }
  })
})

describe('pctChange', () => {
  it('computes standard percentage change', () => {
    expect(pctChange(120, 100)).toBeCloseTo(20)
    expect(pctChange(80, 100)).toBeCloseTo(-20)
  })

  it('returns 0 when both current and previous are 0 (no change, not a crash)', () => {
    expect(pctChange(0, 0)).toBe(0)
  })

  it('returns 100 when previous is 0 but current is positive (avoids Infinity/NaN)', () => {
    expect(pctChange(50, 0)).toBe(100)
  })
})
