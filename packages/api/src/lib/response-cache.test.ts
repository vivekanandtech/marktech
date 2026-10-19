import { describe, it, expect, vi } from 'vitest'
import { cachedMetaFetch, isRateLimitError } from './response-cache'

// No DATABASE_URL in tests → no persistent cache; exercises de-duplication and errors.
describe('cachedMetaFetch', () => {
  it('shares one Meta call between identical concurrent requests', async () => {
    let resolve!: (v: { n: number }) => void
    const fn = vi.fn(() => new Promise<{ n: number }>((r) => { resolve = r }))
    const a = cachedMetaFetch('k:dedupe', 1000, fn)
    const b = cachedMetaFetch('k:dedupe', 1000, fn)
    await new Promise((r) => setTimeout(r, 0))
    resolve({ n: 1 })
    expect(await a).toEqual({ n: 1 })
    expect(await b).toEqual({ n: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('calls Meta again once the previous request has finished', async () => {
    const fn = vi.fn(async () => ({ ok: true }))
    await cachedMetaFetch('k:seq', 1000, fn)
    await cachedMetaFetch('k:seq', 1000, fn)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('rethrows a rate-limit error when there is no saved copy to fall back on', async () => {
    await expect(cachedMetaFetch('k:rl', 1000, async () => { throw new Error('User request limit reached') }))
      .rejects.toThrow('User request limit reached')
  })
})

describe('isRateLimitError', () => {
  it.each([
    'User request limit reached',
    '(#4) Application request limit reached',
    '(#80004) There have been too many calls to this ad-account.',
  ])('recognises "%s"', (msg) => expect(isRateLimitError(new Error(msg))).toBe(true))

  it('ignores unrelated errors', () => {
    expect(isRateLimitError(new Error('Invalid OAuth access token'))).toBe(false)
  })
})
