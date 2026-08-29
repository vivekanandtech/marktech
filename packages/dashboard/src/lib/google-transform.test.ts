import { describe, it, expect } from 'vitest'
import { microsToCurrency, channelLabel, statusLabel, transformGoogleCampaign, transformGoogleAdGroup, transformGoogleAd } from './google-transform'

describe('microsToCurrency', () => {
  it('divides by 1,000,000 (Google Ads API cost unit)', () => {
    expect(microsToCurrency(52_000_000)).toBe(52)
    expect(microsToCurrency('34400000')).toBeCloseTo(34.4)
  })

  it('treats null/undefined as 0', () => {
    expect(microsToCurrency(null)).toBe(0)
    expect(microsToCurrency(undefined)).toBe(0)
  })
})

describe('channelLabel / statusLabel', () => {
  it('maps known Google channel types to display labels', () => {
    expect(channelLabel('PERFORMANCE_MAX')).toBe('PMax')
    expect(channelLabel('SEARCH')).toBe('Search')
  })

  it('passes through unknown channel types rather than dropping them', () => {
    expect(channelLabel('SOME_NEW_TYPE')).toBe('SOME_NEW_TYPE')
  })

  it('maps Google status enums to the app-wide lowercase convention', () => {
    expect(statusLabel('ENABLED')).toBe('active')
    expect(statusLabel('PAUSED')).toBe('paused')
    expect(statusLabel('REMOVED')).toBe('archived')
  })
})

describe('transformGoogleCampaign — metric derivation', () => {
  it('computes roas as conversionsValue / spend', () => {
    const c = transformGoogleCampaign({
      campaign: { id: 'c1', name: 'Test', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
      metrics: { costMicros: 100_000_000, conversionsValue: 300, conversions: 5, ctr: 0.05, clicks: 200, impressions: 4000, averageCpc: 500_000 },
    })
    expect(c.spend).toBe(100)
    expect(c.roas).toBe(3)
    expect(c.cpa).toBe(20) // 100 / 5
    expect(c.ctr).toBeCloseTo(5) // GAQL ctr 0.05 -> displayed as 5%
  })

  it('guards division by zero: roas and cpa are 0, not Infinity/NaN, with no spend/conversions', () => {
    const c = transformGoogleCampaign({
      campaign: { id: 'c1', name: 'Test' },
      metrics: { costMicros: 0, conversionsValue: 500, conversions: 0 },
    })
    expect(c.roas).toBe(0)
    expect(c.cpa).toBe(0)
    expect(Number.isFinite(c.roas)).toBe(true)
  })

  it('platform is always "google", matching what CampaignRow branches on', () => {
    const c = transformGoogleCampaign({ campaign: { id: 'c1' }, metrics: {} })
    expect(c.platform).toBe('google')
  })
})

describe('transformGoogleCampaign — trend', () => {
  it('returns null trend when there is no previousMetrics — must not show a misleading 0%', () => {
    const c = transformGoogleCampaign({ campaign: { id: 'c1' }, metrics: { costMicros: 100_000_000 }, previousMetrics: null })
    expect(c.trend).toBeNull()
  })

  it('computes trend percentages against previousMetrics when present', () => {
    const c = transformGoogleCampaign({
      campaign: { id: 'c1' },
      metrics: { costMicros: 120_000_000, conversionsValue: 480, conversions: 10, ctr: 0.06 },
      previousMetrics: { costMicros: 100_000_000, conversionsValue: 400, conversions: 10, ctr: 0.05 },
    })
    expect(c.trend).not.toBeNull()
    expect(c.trend!.spendPct).toBeCloseTo(20)
    expect(c.trend!.ctrPct).toBeCloseTo(20)
  })
})

describe('transformGoogleAdGroup / transformGoogleAd — malformed input safety', () => {
  it('does not throw on missing metrics/nested objects', () => {
    expect(() => transformGoogleAdGroup({})).not.toThrow()
    expect(() => transformGoogleAd({})).not.toThrow()
  })

  it('nests transformed ads under the ad group', () => {
    const ag = transformGoogleAdGroup({
      adGroup: { id: 'ag1', name: 'Group', status: 'ENABLED' },
      metrics: { costMicros: 50_000_000 },
      ads: [{ adGroupAd: { ad: { id: 'ad1', name: 'Ad One' }, status: 'ENABLED' }, metrics: { costMicros: 10_000_000 } }],
    })
    expect(ag.ads).toHaveLength(1)
    expect(ag.ads[0].id).toBe('ad1')
    expect(ag.ads[0].name).toBe('Ad One')
  })
})
