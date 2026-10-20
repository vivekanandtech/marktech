import { describe, it, expect } from 'vitest'
import { splitWindow } from './meta'

describe('splitWindow', () => {
  it('splits a 30-day window into contiguous ≤7-day slices covering every day exactly once', () => {
    const slices = splitWindow({ since: '2026-09-21', until: '2026-10-20' })
    expect(slices[0]).toEqual({ since: '2026-09-21', until: '2026-09-27' })
    expect(slices[slices.length - 1].until).toBe('2026-10-20')
    expect(slices).toHaveLength(5)
    for (let i = 1; i < slices.length; i++) {
      const prev = new Date(slices[i - 1].until); prev.setUTCDate(prev.getUTCDate() + 1)
      expect(slices[i].since).toBe(prev.toISOString().slice(0, 10))
    }
  })
  it('returns a single slice for short windows', () => {
    expect(splitWindow({ since: '2026-10-14', until: '2026-10-20' })).toEqual([{ since: '2026-10-14', until: '2026-10-20' }])
  })
})
