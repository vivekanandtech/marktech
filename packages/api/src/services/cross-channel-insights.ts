import { getPool } from '../lib/db'
import { callStructured } from './llm-provider'
import { currentWindow } from '../lib/dateWindows'
import { computeOverviewMetrics } from './metrics-engine'
import { metaReportedRevenueOf, sumActionCount, PURCHASE_ACTION_TYPES } from '../lib/meta-actions'
import { dbGetToken as dbGetMetaToken, getCampaignInsightsForWindow } from './meta'
import { dbGetGoogleToken, getValidAccessToken as getValidGoogleAccessToken, getGoogleCampaignsForWindow } from './google'

const TOP_N = 10

function summarizeMetaCampaign(raw: any) {
  const spend = parseFloat(raw.spend) || 0
  const revenue = metaReportedRevenueOf(raw)
  const roas = spend > 0 ? revenue / spend : 0
  const purchases = sumActionCount(raw, PURCHASE_ACTION_TYPES)
  const cpa = purchases > 0 ? spend / purchases : 0
  return {
    id: raw.campaign_id,
    name: raw.campaign_name,
    spend, roas, cpa,
    ctr: parseFloat(raw.ctr) || 0,
    frequency: parseFloat(raw.frequency) || 0,
    conversions: purchases,
  }
}

function summarizeGoogleCampaign(raw: any) {
  const m = raw.metrics ?? {}
  const spend = (Number(m.costMicros) || 0) / 1_000_000
  const revenue = Number(m.conversionsValue) || 0
  const roas = spend > 0 ? revenue / spend : 0
  const conversions = Number(m.conversions) || 0
  const cpa = conversions > 0 ? spend / conversions : 0
  return {
    id: raw.campaign?.id,
    name: raw.campaign?.name,
    channelType: raw.campaign?.advertisingChannelType,
    status: raw.campaign?.status,
    spend, roas, cpa,
    ctr: Number(m.ctr) || 0,
    conversions,
  }
}

export interface CrossChannelInput {
  truthMetrics: {
    mer: number
    attributedCPR: number
    nCAC: number | null
    overClaimMultiplier: number
    platformClaimedRevenue: number
    shopifyNetRevenue: number
    metaSpend: number
    googleSpend: number
    metaSessions: number
    sourceConfidence: 'exact' | 'approximate'
  }
  meta: {
    connected: boolean
    topCampaigns: ReturnType<typeof summarizeMetaCampaign>[]
  }
  google: {
    connected: boolean
    topCampaigns: ReturnType<typeof summarizeGoogleCampaign>[]
  }
  shopify: {
    connected: boolean
    countryBreakdown: { country: string; orders: number; netSales: number }[]
  }
}

export async function buildCrossChannelInput(clientId: string, dateRange: string): Promise<CrossChannelInput> {
  const overview = await computeOverviewMetrics(clientId, dateRange)

  const [metaToken, googleToken] = await Promise.all([
    dbGetMetaToken(clientId),
    dbGetGoogleToken(clientId),
  ])

  let metaCampaigns: ReturnType<typeof summarizeMetaCampaign>[] = []
  if (metaToken?.selectedAdAccountId) {
    try {
      const raw = await getCampaignInsightsForWindow(metaToken.selectedAdAccountId, metaToken.accessToken, currentWindow(dateRange))
      metaCampaigns = raw.map(summarizeMetaCampaign).sort((a, b) => b.spend - a.spend).slice(0, TOP_N)
    } catch { /* non-fatal — insights still generate off truth metrics + whichever channel worked */ }
  }

  let googleCampaigns: ReturnType<typeof summarizeGoogleCampaign>[] = []
  if (googleToken?.customerId) {
    try {
      const accessToken = await getValidGoogleAccessToken(clientId)
      if (accessToken) {
        const raw = await getGoogleCampaignsForWindow(googleToken.customerId, accessToken, currentWindow(dateRange))
        googleCampaigns = raw.map(summarizeGoogleCampaign).sort((a, b) => b.spend - a.spend).slice(0, TOP_N)
      }
    } catch { /* non-fatal */ }
  }

  return {
    truthMetrics: {
      mer: overview.current.mer,
      attributedCPR: overview.current.attributedCPR,
      nCAC: overview.current.newCustomerDataAvailable ? overview.current.nCAC : null,
      overClaimMultiplier: overview.current.overClaimMultiplier,
      platformClaimedRevenue: overview.current.platformClaimedRevenue,
      shopifyNetRevenue: overview.current.shopifyNetRevenue,
      metaSpend: overview.current.metaSpend,
      googleSpend: overview.current.googleSpend,
      metaSessions: overview.current.metaSessions,
      sourceConfidence: overview.current.sourceConfidence,
    },
    meta: { connected: overview.connected.meta, topCampaigns: metaCampaigns },
    google: { connected: overview.connected.google, topCampaigns: googleCampaigns },
    shopify: { connected: overview.connected.shopify, countryBreakdown: overview.countryBreakdown },
  }
}

export type RecommendationCategory = 'scale' | 'fix' | 'tracking' | 'creative' | 'budget' | 'geography'
export type RecommendationConfidence = 'high' | 'medium' | 'low'
export type RecommendationEffort = 'low' | 'medium' | 'high'
export type RecommendationStatus = 'new' | 'done' | 'dismissed'

export interface RankedRecommendation {
  rank: number
  category: RecommendationCategory
  title: string
  evidence: string
  expectedImpact: string
  confidence: RecommendationConfidence
  effort: RecommendationEffort
  sourceMetricId: string | null
  sourceEntity: { type: 'campaign' | 'account' | 'channel'; id: string | null; platform: 'meta' | 'google' | 'shopify' | null } | null
  status: RecommendationStatus
}

const RECOMMENDATION_SCHEMA = {
  type: 'object',
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rank: { type: 'integer' },
          category: { type: 'string', enum: ['scale', 'fix', 'tracking', 'creative', 'budget', 'geography'] },
          title: { type: 'string' },
          evidence: { type: 'string' },
          expectedImpact: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] },
          sourceMetricId: { type: ['string', 'null'] },
          sourceEntity: {
            type: ['object', 'null'],
            properties: {
              type: { type: 'string', enum: ['campaign', 'account', 'channel'] },
              id: { type: ['string', 'null'] },
              platform: { type: ['string', 'null'], enum: ['meta', 'google', 'shopify', null] },
            },
            required: ['type', 'id', 'platform'],
            additionalProperties: false,
          },
        },
        required: ['rank', 'category', 'title', 'evidence', 'expectedImpact', 'confidence', 'effort', 'sourceMetricId', 'sourceEntity'],
        additionalProperties: false,
      },
    },
  },
  required: ['recommendations'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You are a senior cross-channel growth lead advising an e-commerce brand that spends on both Meta and Google Ads, sold through Shopify. Your job is to reconcile what the ad platforms CLAIM against what Shopify's actual order and revenue data CONFIRMS, and rank what the growth team should do next.

The single most important discipline you must apply: Meta and Google self-report their own conversions and are structurally incentivized to over-claim. Shopify's net revenue and orders-by-channel are ground truth. Whenever a channel's self-reported ROAS/conversions look strong but the truthMetrics (attributedCPR, mer, overClaimMultiplier, shopifyNetRevenue) don't back it up, that is NOT a "scale" opportunity — it is a "tracking" problem (pixel misattribution, view-through inflation, or a broken UTM/tracking setup) and must be labeled and ranked as such.

Rules:
- Ground every recommendation in the SPECIFIC numbers provided — name the actual campaign, channel, or metric value. Never write something generic enough to apply to any account.
- Cross-reference channels against each other and against truthMetrics before concluding anything. A high Meta-reported ROAS campaign whose spend isn't reflected in a proportional rise in shopifyNetRevenue is a tracking finding, not a scale finding.
- category "scale": a specific campaign or channel that is genuinely working (confirmed by truth metrics, not just platform-reported numbers) and should get more budget.
- category "fix": a specific campaign or channel actively losing money or clearly underperforming its own channel's peers.
- category "tracking": a mismatch between what a platform claims and what Shopify truth data shows — pixel/attribution/tracking integrity issues.
- category "creative": a pattern about ad fatigue, frequency, or creative format worth acting on.
- category "budget": overall spend allocation across Meta vs Google is misaligned with what's actually working.
- category "geography": a country/region in the Shopify country breakdown that is over- or under-served by current ad spend.
- Use sourceEntity to point at the specific campaign (type "campaign", id = the campaign id, platform = "meta" or "google") or leave it account/channel-level with id null when the finding is about a whole channel or the account overall.
- Use sourceMetricId with one of these exact ids where the finding is best explained by that metric's definition: "mer", "attributedCPR", "nCAC", "overClaimMultiplier", "platformClaimedRevenue", "metaSessions". Use null if no single metric fits.
- Return at most 8 recommendations, ranked 1 (most important) to N, by real business impact — money at stake first.
- If a data source (Meta, Google, or Shopify) is not connected, do not fabricate findings that require it — work only with what's actually connected and provided.
- Be honest if the account looks healthy — it's fine to return fewer than 8 recommendations.`

// The only ids the Inspect drawer (GET /api/metrics/definitions) can actually
// resolve — the LLM sometimes names a plausible-but-unregistered metric (e.g.
// "roas"), which would silently render an empty drawer, so anything else is nulled.
const KNOWN_METRIC_IDS = new Set(['mer', 'attributedCPR', 'nCAC', 'overClaimMultiplier', 'platformClaimedRevenue', 'metaSessions'])

export async function generateCrossChannelInsights(input: CrossChannelInput): Promise<RankedRecommendation[]> {
  const userPrompt = `Analyze this cross-channel account data and return your ranked recommendations as structured JSON.\n\n${JSON.stringify(input)}`
  const result = await callStructured<{ recommendations: Omit<RankedRecommendation, 'status'>[] }>(
    SYSTEM_PROMPT,
    userPrompt,
    RECOMMENDATION_SCHEMA,
    'cross_channel_recommendations'
  )
  return (result.recommendations ?? [])
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({
      ...r,
      sourceMetricId: r.sourceMetricId && KNOWN_METRIC_IDS.has(r.sourceMetricId) ? r.sourceMetricId : null,
      status: 'new' as RecommendationStatus,
    }))
}

export interface CrossChannelInsightsPayload {
  recommendations: RankedRecommendation[]
  dateRange: string
  generatedAt: string
}

export async function dbSaveCrossChannelInsights(clientId: string, dateRange: string, recommendations: RankedRecommendation[]): Promise<CrossChannelInsightsPayload> {
  const generatedAt = new Date().toISOString()
  const payload: CrossChannelInsightsPayload = { recommendations, dateRange, generatedAt }
  const db = getPool()
  if (db) {
    await db.query(
      `INSERT INTO cross_channel_insights (client_id, date_range, payload, generated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id) DO UPDATE SET date_range = EXCLUDED.date_range, payload = EXCLUDED.payload, generated_at = EXCLUDED.generated_at`,
      [clientId, dateRange, JSON.stringify(payload), generatedAt]
    )
  }
  return payload
}

export async function dbGetCrossChannelInsights(clientId: string): Promise<CrossChannelInsightsPayload | null> {
  const db = getPool()
  if (!db) return null
  const res = await db.query(`SELECT payload FROM cross_channel_insights WHERE client_id = $1`, [clientId])
  return res.rows[0]?.payload ?? null
}

export async function dbUpdateRecommendationStatus(clientId: string, rank: number, status: RecommendationStatus): Promise<CrossChannelInsightsPayload | null> {
  const existing = await dbGetCrossChannelInsights(clientId)
  if (!existing) return null
  const recommendations = existing.recommendations.map((r) => (r.rank === rank ? { ...r, status } : r))
  const db = getPool()
  const payload: CrossChannelInsightsPayload = { ...existing, recommendations }
  if (db) {
    await db.query(`UPDATE cross_channel_insights SET payload = $2 WHERE client_id = $1`, [clientId, JSON.stringify(payload)])
  }
  return payload
}
