import { callStructured } from './llm-provider'

export interface InsightInput {
  account: {
    spend: number; roas: number; ctr: number; cpa: number; cpm: number
    reach: number; impressions: number; clicks: number
  }
  campaigns: {
    id: string; name: string; spend: number; roas: number; ctr: number; cpa: number
    frequency: number; conversions: number; objective: string; status: string
  }[]
  creatives: {
    id: string; name: string; format: string; spend: number; roas: number
    ctr: number; frequency: number
  }[]
}

export interface GeneratedInsight {
  severity: 'critical' | 'warning' | 'opportunity' | 'info'
  title: string
  message: string
  recommendation: string
  entityType: 'account' | 'campaign' | 'creative'
  entityId: string | null
}

const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'warning', 'opportunity', 'info'] },
          title: { type: 'string' },
          message: { type: 'string' },
          recommendation: { type: 'string' },
          entityType: { type: 'string', enum: ['account', 'campaign', 'creative'] },
          entityId: { type: ['string', 'null'] },
        },
        required: ['severity', 'title', 'message', 'recommendation', 'entityType', 'entityId'],
        additionalProperties: false,
      },
    },
  },
  required: ['insights'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You are a senior Meta Ads media buyer and performance marketing lead with 10+ years running paid social for agencies. An agency owner is looking at this account data and needs your actual judgment — not a template.

Rules:
- Every insight must reference the SPECIFIC numbers you were given for that entity (name, ROAS, spend, frequency, etc.) — never write a generic sentence that could apply to any campaign.
- Never reuse the same sentence, phrasing, or recommendation wording across two different insights, even if the underlying metric pattern is similar. Vary your language like a human writing separate notes would.
- Prioritize by real business impact: a high-spend underperformer matters more than a low-spend one at the same ROAS.
- Use entityType "campaign" or "creative" with the exact id provided when an insight is about one specific item. Use entityType "account" with entityId null for account-wide patterns (budget concentration, format mix, overall trend) that aren't about a single item.
- Return at most 8 insights total, sorted with the most important first.
- Be honest if something looks fine — don't invent a problem. It's fine to return fewer than 8 insights if the account is genuinely healthy.
- Write "message" as the observation (what's happening and why it matters) and "recommendation" as a concrete next action a media buyer would actually take.

Severity definitions — pick exactly one per insight, these are not interchangeable:
- "critical": active financial loss happening right now (e.g. ROAS well below breakeven on real spend). Needs action today.
- "opportunity": a clear POSITIVE finding — something performing very well that should be scaled, replicated, or leaned into. A high-ROAS winner is always "opportunity", never "warning".
- "warning": a risk or negative trend that isn't yet a loss but could become one if ignored (fatigue, declining trend, budget concentration risk).
- "info": neutral, FYI-level observation with no urgency either way (format mix, minor pattern worth knowing).`

export async function generateInsights(input: InsightInput): Promise<GeneratedInsight[]> {
  const userPrompt = `Analyze this Meta Ads account and return your prioritized insights as structured JSON.\n\n${JSON.stringify(input)}`
  const result = await callStructured<{ insights: GeneratedInsight[] }>(
    SYSTEM_PROMPT,
    userPrompt,
    INSIGHTS_SCHEMA,
    'ad_account_insights'
  )
  return result.insights ?? []
}
