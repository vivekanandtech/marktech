import { describe, it, expect } from 'vitest'
import { safeFloat, safeInt, transformInsightMetrics, transformMetaAd, transformMetaAdSet, transformMetaCampaign, computeTrend, isMetricImproving } from './meta-transform'

describe('safeFloat / safeInt', () => {
  it('parse numeric strings', () => {
    expect(safeFloat('12.5')).toBe(12.5)
    expect(safeInt('42')).toBe(42)
  })

  it('default to 0 for null/undefined rather than NaN', () => {
    expect(safeFloat(null)).toBe(0)
    expect(safeFloat(undefined)).toBe(0)
    expect(safeInt(null)).toBe(0)
  })

  it('default to 0 for unparseable garbage rather than propagating NaN', () => {
    expect(safeFloat('not-a-number')).toBe(0)
    expect(safeInt('abc')).toBe(0)
  })
})

describe('transformInsightMetrics — ROAS derivation', () => {
  it('prefers Meta-reported purchase_roas[0] when present', () => {
    const m = transformInsightMetrics({ spend: '1000', purchase_roas: [{ value: '6.2' }], action_values: [] })
    expect(m.roas).toBe(6.2)
  })

  it('falls back to conversion_value ÷ spend when purchase_roas is absent', () => {
    const m = transformInsightMetrics({
      spend: '1000',
      action_values: [{ action_type: 'purchase', value: '3000' }],
    })
    expect(m.roas).toBe(3)
  })

  it('roas is 0 (not NaN/Infinity) when spend is 0, even with reported conversion value', () => {
    const m = transformInsightMetrics({ spend: '0', action_values: [{ action_type: 'purchase', value: '500' }] })
    expect(m.roas).toBe(0)
  })

  it('only counts purchase-type actions toward conversions/conversion value, not all actions', () => {
    const m = transformInsightMetrics({
      spend: '100',
      actions: [
        { action_type: 'purchase', value: '5' },
        { action_type: 'link_click', value: '500' }, // must not be counted as a conversion
      ],
    })
    expect(m.conversions).toBe(5)
  })
})

describe('transformInsightMetrics — division guards', () => {
  it('cpa is 0 when there are zero conversions', () => {
    const m = transformInsightMetrics({ spend: '500', actions: [] })
    expect(m.cpa).toBe(0)
  })

  it('cpc is 0 when there are zero clicks', () => {
    const m = transformInsightMetrics({ spend: '500', clicks: '0' })
    expect(m.cpc).toBe(0)
  })

  it('handles a completely empty/missing insight object without throwing', () => {
    expect(() => transformInsightMetrics(undefined)).not.toThrow()
    expect(() => transformInsightMetrics(null)).not.toThrow()
    expect(transformInsightMetrics(null).spend).toBe(0)
  })
})

describe('actionTag thresholds (via transformMetaCampaign)', () => {
  const withRoas = (roasValue: string) => ({
    id: 'c1', name: 'Test', insights: { spend: '100', purchase_roas: [{ value: roasValue }] },
  })

  it('tags "scale" at or above 4.5x', () => {
    expect(transformMetaCampaign(withRoas('4.5'))?.actionTag).toBe('scale')
    expect(transformMetaCampaign(withRoas('10'))?.actionTag).toBe('scale')
  })

  it('tags "watch" between 3x (inclusive) and 4.5x', () => {
    expect(transformMetaCampaign(withRoas('3.0'))?.actionTag).toBe('watch')
    expect(transformMetaCampaign(withRoas('4.4'))?.actionTag).toBe('watch')
  })

  it('tags "optimise" below 3x', () => {
    expect(transformMetaCampaign(withRoas('2.99'))?.actionTag).toBe('optimise')
    expect(transformMetaCampaign(withRoas('0'))?.actionTag).toBe('optimise')
  })
})

describe('computeTrend', () => {
  it('returns null when there is no previous-period data — must not show a misleading 0%', () => {
    expect(computeTrend({ spend: '100' }, null)).toBeNull()
    expect(computeTrend({ spend: '100' }, undefined)).toBeNull()
  })

  it('computes per-metric percentage change between current and previous insights', () => {
    const current = { spend: '120', purchase_roas: [{ value: '5' }], ctr: '2.0', actions: [{ action_type: 'purchase', value: '10' }] }
    const previous = { spend: '100', purchase_roas: [{ value: '4' }], ctr: '1.5', actions: [{ action_type: 'purchase', value: '10' }] }
    const trend = computeTrend(current, previous)
    expect(trend).not.toBeNull()
    expect(trend!.spendPct).toBeCloseTo(20)   // 120 vs 100
    expect(trend!.roasPct).toBeCloseTo(25)    // 5 vs 4
    expect(trend!.ctrPct).toBeCloseTo(33.33, 1) // 2.0 vs 1.5
    expect(trend!.cpaPct).toBeCloseTo(20)     // cpa = spend/conversions, conversions equal so tracks spend
  })
})

describe('isMetricImproving', () => {
  it('higher is better for roas and ctr', () => {
    expect(isMetricImproving('roas', 10)).toBe(true)
    expect(isMetricImproving('roas', -10)).toBe(false)
    expect(isMetricImproving('ctr', 5)).toBe(true)
    expect(isMetricImproving('ctr', -5)).toBe(false)
  })

  it('lower is better for cpa — a rising CPA is a regression, not an improvement', () => {
    expect(isMetricImproving('cpa', -10)).toBe(true)
    expect(isMetricImproving('cpa', 10)).toBe(false)
  })

  it('spend has no inherent direction — never flagged as a regression', () => {
    expect(isMetricImproving('spend', 500)).toBe(true)
    expect(isMetricImproving('spend', -500)).toBe(true)
  })
})

describe('transformMetaAd / AdSet / Campaign — malformed input safety', () => {
  it('return null instead of throwing when given garbage input', () => {
    expect(transformMetaAd(null as any)).toBeNull()
    expect(transformMetaAd(undefined as any)).toBeNull()
    expect(transformMetaAdSet(null as any)).toBeNull()
    expect(transformMetaCampaign(null as any)).toBeNull()
  })

  it('filters out null children rather than crashing the parent transform', () => {
    const campaign = {
      id: 'c1', name: 'Campaign', insights: { spend: '100' },
      adsets: [
        { id: 'as1', name: 'Good adset', insights: {}, ads: [] },
        null, // malformed sibling — must not break the whole campaign transform
      ],
    }
    const result = transformMetaCampaign(campaign)
    expect(result).not.toBeNull()
    expect(result?.adSets).toHaveLength(1)
    expect(result?.adSets[0].id).toBe('as1')
  })

  it('derives ad format from creative fields', () => {
    const videoAd = transformMetaAd({ id: 'a1', creative: { video_id: '123' }, insights: {} })
    const carouselAd = transformMetaAd({ id: 'a2', creative: { object_type: 'SHARE' }, insights: {} })
    const imageAd = transformMetaAd({ id: 'a3', creative: {}, insights: {} })
    expect(videoAd?.format).toBe('video')
    expect(carouselAd?.format).toBe('carousel')
    expect(imageAd?.format).toBe('image')
  })
})
