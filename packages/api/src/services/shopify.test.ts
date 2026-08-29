import { describe, it, expect } from 'vitest'
import { classifyChannel, reshapeShopifyQLRows } from './shopify'

describe('classifyChannel', () => {
  it('classifies paid Meta traffic — instagram/facebook/c2c WITH a campaign medium', () => {
    expect(classifyChannel('instagram', 'Adv+ | Max Value – Catalogue', 'C2C')).toBe('meta')
    expect(classifyChannel('facebook', 'paid', 'facebook')).toBe('meta')
    expect(classifyChannel('c2c', 'Adv | Max Value - Reel', 'C2C')).toBe('meta')
  })

  it('does NOT classify organic Instagram/Facebook clicks as meta (no medium present)', () => {
    // Real observed case: referring_channel=instagram, utm_source=facebook, utm_medium=null
    // — this is an organic click without ad-campaign tagging, must not inflate Attributed CPR.
    expect(classifyChannel('instagram', '', 'facebook')).not.toBe('meta')
    expect(classifyChannel('facebook', '', '')).not.toBe('meta')
  })

  it('classifies paid Google traffic — utm_medium=cpc with google source or channel', () => {
    expect(classifyChannel('google', 'cpc', 'google')).toBe('google')
    expect(classifyChannel('', 'cpc', 'google')).toBe('google')
  })

  it('does NOT classify organic Google search as google channel (no cpc medium)', () => {
    expect(classifyChannel('google', '', '')).toBe('organic')
  })

  it('classifies direct traffic', () => {
    expect(classifyChannel('direct', '', '')).toBe('direct')
  })

  it('classifies other known organic search engines without a medium as organic', () => {
    expect(classifyChannel('bing', '', '')).toBe('organic')
    expect(classifyChannel('duckduckgo', '', '')).toBe('organic')
  })

  it('falls back to "other" for unattributed/unknown combinations', () => {
    expect(classifyChannel('', '', '')).toBe('other')
    expect(classifyChannel('unattributed', '', '')).toBe('other')
    expect(classifyChannel('loox', '', '')).toBe('other')
  })

  it('is case-insensitive on all three inputs', () => {
    expect(classifyChannel('INSTAGRAM', 'Some Campaign', 'C2C')).toBe('meta')
    expect(classifyChannel('Google', 'CPC', 'GOOGLE')).toBe('google')
  })
})

describe('reshapeShopifyQLRows', () => {
  it('converts object-keyed rows into arrays ordered by the columns list', () => {
    const columns = [{ name: 'referring_channel' }, { name: 'orders' }, { name: 'total_sales' }]
    const rawRows = [
      { referring_channel: 'instagram', orders: '12', total_sales: '385900.1' },
      { referring_channel: 'google', total_sales: '54325.88', orders: '2' }, // deliberately out of order
    ]
    expect(reshapeShopifyQLRows(columns, rawRows)).toEqual([
      ['instagram', '12', '385900.1'],
      ['google', '2', '54325.88'],
    ])
  })

  it('defaults missing fields to empty string rather than undefined', () => {
    const columns = [{ name: 'utm_medium' }, { name: 'orders' }]
    const rawRows = [{ orders: '5' }] // utm_medium absent — Shopify omits null fields sometimes
    expect(reshapeShopifyQLRows(columns, rawRows)).toEqual([['', '5']])
  })

  it('returns an empty array for empty input without throwing', () => {
    expect(reshapeShopifyQLRows([{ name: 'x' }], [])).toEqual([])
  })
})
