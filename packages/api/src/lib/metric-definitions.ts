// Semantic metrics layer — the "why should I trust this number" layer.
// Static, hand-maintained registry rather than DB-backed: this text changes
// rarely and editing it shouldn't require a migration. Served via
// GET /api/metrics/definitions so the frontend doesn't duplicate this copy.

export interface MetricSource {
  id: string
  name: string
  description: string
}

export const METRIC_SOURCES: Record<string, MetricSource> = {
  shopify: { id: 'shopify', name: 'Shopify', description: 'Orders, customers, sessions — Admin API + ShopifyQL' },
  meta: { id: 'meta', name: 'Meta Ads', description: 'Spend, reported conversions — Marketing API' },
  google: { id: 'google', name: 'Google Ads', description: 'Spend, reported conversions — Google Ads API' },
  derived: { id: 'derived', name: 'Derived', description: 'Computed in the metrics engine, not fetched directly' },
}

export interface MetricDefinition {
  id: string
  label: string
  definition: string
  formula: string
  sources: string[] // keys into METRIC_SOURCES
  pipelineCadence: string
  caveat?: string
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  mer: {
    id: 'mer',
    label: 'MER',
    definition: 'The single blended efficiency number for all paid marketing: how much real revenue you earned for every rupee spent across Meta and Google combined.',
    formula: 'MER = Shopify Net Revenue ÷ (Meta Spend + Google Spend)',
    sources: ['shopify', 'meta', 'google'],
    pipelineCadence: 'Recomputed on every load, cached 10 minutes',
    caveat: 'Uses Shopify’s actual net revenue, not Meta or Google’s self-reported revenue — this is the truth number, not a platform vanity metric.',
  },
  attributedCPR: {
    id: 'attributedCPR',
    label: 'Attributed CPR',
    definition: 'What Meta actually cost you per real, traceable Shopify order — not per conversion Meta claims to have driven.',
    formula: 'Attributed CPR = Meta Spend ÷ Shopify orders whose last click before purchase came from a paid Meta campaign',
    sources: ['meta', 'shopify'],
    pipelineCadence: 'Recomputed on every load, cached 10 minutes',
    caveat: 'Only orders with a paid campaign tag count as Meta-attributed — organic Instagram/Facebook clicks are excluded, so this is typically higher than Meta’s own reported CPA.',
  },
  nCAC: {
    id: 'nCAC',
    label: 'New-Customer CAC',
    definition: 'The blended cost to acquire one new, first-time customer, across all paid channels.',
    formula: 'nCAC = (Meta Spend + Google Spend) ÷ New customers (Shopify orders where it was that customer’s first-ever order)',
    sources: ['meta', 'google', 'shopify'],
    pipelineCadence: 'Sampled from up to 500 recent orders per period',
    caveat: 'Requires the read_customers Shopify permission. Shows as unavailable rather than ₹0 when that scope isn’t granted yet — a real ₹0 would misleadingly imply free acquisition.',
  },
  overClaimMultiplier: {
    id: 'overClaimMultiplier',
    label: 'Platform Over-claim',
    definition: 'How many times more revenue Meta and Google together claim to have driven, compared to what Shopify actually banked.',
    formula: 'Over-claim = (Meta-reported revenue + Google-reported revenue) ÷ Shopify Net Revenue',
    sources: ['meta', 'google', 'shopify'],
    pipelineCadence: 'Recomputed on every load, cached 10 minutes',
    caveat: 'A value above 1.0× means platforms are taking credit for revenue that didn’t really happen (double-counting, view-through, cross-device inflation) — some over-claim is normal, but a rising trend is a red flag.',
  },
  metaOverClaimMultiplier: {
    id: 'metaOverClaimMultiplier',
    label: 'Meta Over-claim',
    definition: 'How many times more revenue Meta claims to have driven, compared to Shopify orders actually traced back to a Meta click.',
    formula: 'Meta Over-claim = Meta-reported revenue ÷ Shopify net revenue from orders attributed to Meta',
    sources: ['meta', 'shopify'],
    pipelineCadence: 'Recomputed on every load, cached 10 minutes',
    caveat: 'Compares Meta against ONLY the revenue Shopify traces to Meta — not total store revenue — so this isolates Meta’s own tracking accuracy from Google’s.',
  },
  googleOverClaimMultiplier: {
    id: 'googleOverClaimMultiplier',
    label: 'Google Over-claim',
    definition: 'How many times more revenue Google claims to have driven, compared to Shopify orders actually traced back to a Google click.',
    formula: 'Google Over-claim = Google-reported revenue ÷ Shopify net revenue from orders attributed to Google',
    sources: ['google', 'shopify'],
    pipelineCadence: 'Recomputed on every load, cached 10 minutes',
    caveat: 'Compares Google against ONLY the revenue Shopify traces to Google — not total store revenue — so this isolates Google’s own tracking accuracy from Meta’s.',
  },
  platformClaimedRevenue: {
    id: 'platformClaimedRevenue',
    label: 'Platform-Claimed Revenue',
    definition: 'The revenue Meta and Google self-report as driven by their ads — not verified against actual store sales.',
    formula: 'Platform-Claimed Revenue = Meta-reported revenue + Google-reported revenue',
    sources: ['meta', 'google'],
    pipelineCadence: 'Recomputed on every load, cached 10 minutes',
    caveat: 'Each platform can only see its own pixel/conversion data — it has no visibility into the other platform, refunds, or whether the sale happened at all. Treat as directional, not truth.',
  },
  metaSessions: {
    id: 'metaSessions',
    label: 'Sessions (from Meta)',
    definition: 'Real Shopify storefront sessions where the visitor’s last click came from Meta (Facebook or Instagram).',
    formula: 'Count of Shopify sessions where utm_source is Facebook, or the referrer is Instagram/Facebook',
    sources: ['shopify'],
    pipelineCadence: 'Recomputed on every load, cached 10 minutes',
    caveat: 'Sourced from Shopify’s own session tracking, not Meta’s pixel — avoids the inflation Meta’s own reach/impression numbers can carry.',
  },
}
