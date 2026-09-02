import { describe, it, expect } from 'vitest'
import { safeFloat, safeInt, transformInsightMetrics, transformMetaAd, transformMetaAdSet, transformMetaCampaign, computeTrend, isMetricImproving, classifyCreativeFormat } from './meta-transform'

// Fixtures shaped like real ad creatives observed live on a connected Meta
// account (2026-08) — not guessed. object_type was 'SHARE' on nearly every
// ad regardless of actual content; video_id was absent at the top level for
// genuine video ads; multi-asset ads used asset_feed_spec (Advantage+)
// rather than the classic link_data.child_attachments carousel shape.
describe('classifyCreativeFormat', () => {
  it('classifies a real single-image ad (object_type SHARE, no other signals) as image, not carousel', () => {
    expect(classifyCreativeFormat({ object_type: 'SHARE' })).toBe('image')
  })

  it('classifies object_type VIDEO as video even with no top-level video_id', () => {
    expect(classifyCreativeFormat({ object_type: 'VIDEO' })).toBe('video')
  })

  it('classifies a creative with nested object_story_spec.video_data as video', () => {
    expect(classifyCreativeFormat({ object_type: 'SHARE', object_story_spec: { video_data: { image_url: 'x' } } })).toBe('video')
  })

  it('classifies Advantage+ multi-video asset_feed_spec as video', () => {
    expect(classifyCreativeFormat({ object_type: 'SHARE', asset_feed_spec: { videos: [{ id: '1' }, { id: '2' }] } })).toBe('video')
  })

  it('classifies Advantage+ multi-image asset_feed_spec (>1 image) as carousel', () => {
    expect(classifyCreativeFormat({ object_type: 'SHARE', asset_feed_spec: { images: [{ hash: '1' }, { hash: '2' }] } })).toBe('carousel')
  })

  it('classifies classic link_data.child_attachments (>1) as carousel', () => {
    expect(classifyCreativeFormat({ object_type: 'SHARE', object_story_spec: { link_data: { child_attachments: [{}, {}] } } })).toBe('carousel')
  })

  it('a single asset_feed_spec image (length 1) is not a carousel', () => {
    expect(classifyCreativeFormat({ object_type: 'SHARE', asset_feed_spec: { images: [{ hash: '1' }] } })).toBe('image')
  })

  it('video signal takes priority over a multi-image signal on the same creative', () => {
    expect(classifyCreativeFormat({
      object_type: 'VIDEO',
      asset_feed_spec: { images: [{ hash: '1' }, { hash: '2' }] },
    })).toBe('video')
  })

  it('handles null/undefined creative without throwing', () => {
    expect(classifyCreativeFormat(null)).toBe('image')
    expect(classifyCreativeFormat(undefined)).toBe('image')
  })
})

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
    // Verified live against a real ad account: object_type is 'SHARE' for the
    // vast majority of ads regardless of actual content — it alone must NOT
    // be read as "carousel", or every single-image ad gets misclassified.
    const singleImageAd = transformMetaAd({ id: 'a2', creative: { object_type: 'SHARE' }, insights: {} })
    const imageAd = transformMetaAd({ id: 'a3', creative: {}, insights: {} })
    expect(videoAd?.format).toBe('video')
    expect(singleImageAd?.format).toBe('image')
    expect(imageAd?.format).toBe('image')
  })
})
