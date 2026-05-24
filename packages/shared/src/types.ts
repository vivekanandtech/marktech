// ─── Enums / Literals ───────────────────────────────────────────────────────

export type Platform = 'meta' | 'google'
export type Market = 'all' | 'india' | 'international'
export type DateRange = '1D' | '3D' | '7D' | '14D' | '30D' | '3M' | '6M' | '1Y'
export type AdStatus = 'active' | 'paused' | 'draft' | 'disapproved' | 'learning'
export type CampaignType = 'advantage_plus' | 'lookalike' | 'retargeting' | 'prospecting' | 'brand_awareness'
export type CreativeFormat = 'video' | 'image' | 'carousel' | 'reel' | 'collection'
export type ActionTag = 'scale' | 'watch' | 'pause' | 'optimise'
export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertType =
  | 'creative_fatigue'
  | 'budget_cap'
  | 'roas_drop'
  | 'high_performer'
  | 'learning_phase'
  | 'anomaly'
  | 'token_expiry'
  | 'spend_velocity'

// ─── Tenant / Client ────────────────────────────────────────────────────────

export interface Client {
  id: string
  name: string
  industry: string
  logoInitials: string
  logoColor: string
  totalSpend: number
  blendedRoas: number
  metaAccountId?: string
  googleAccountId?: string
}

// ─── Summary / KPI Metrics ──────────────────────────────────────────────────

export interface TrendValue {
  value: number
  change: number   // % change vs previous period (positive = better)
  improving: boolean
}

export interface SummaryMetrics {
  adSpend: TrendValue
  netSales: TrendValue
  orders: TrendValue
  attributedOrders: TrendValue
  blendedRoas: TrendValue
  attributedRoas: TrendValue
  cac: TrendValue          // Customer Acquisition Cost
  aov: TrendValue          // Average Order Value
  sessions: TrendValue
  cmRatio: TrendValue      // Contribution Margin ratio %
  discountRate: TrendValue // % of revenue discounted
  internationalRevenue: TrendValue
  reach: TrendValue
  cpm: TrendValue
  cpc: TrendValue
  ctr: TrendValue
  cpa: TrendValue
  newCustomerRate: TrendValue  // % new vs returning
}

// ─── Chart Data ─────────────────────────────────────────────────────────────

export interface ChartDataPoint {
  date: string
  adSpend: number
  netSales: number
  blendedRoas: number
  attributedRoas: number
  conversionRate: number
  sessions: number
  metaSpend: number
  googleSpend: number
}

export interface FormatBreakdownPoint {
  format: CreativeFormat
  spend: number
  roas: number
  impressions: number
}

// ─── Campaign Hierarchy ──────────────────────────────────────────────────────

export interface Ad {
  id: string
  adSetId: string
  name: string
  format: CreativeFormat
  status: AdStatus
  thumbnailUrl: string
  spend: number
  purchaseValue: number
  roas: number
  ctr: number
  cpa: number
  cpc: number
  cpm: number
  impressions: number
  clicks: number
  conversions: number
  reach: number
  frequency: number
  actionTag: ActionTag
  trend: number   // % change vs prev period
}

export interface AdSet {
  id: string
  campaignId: string
  name: string
  audience: string
  status: AdStatus
  budget: number
  spend: number
  purchaseValue: number
  roas: number
  ctr: number
  cpa: number
  cpc: number
  cpm: number
  impressions: number
  clicks: number
  conversions: number
  reach: number
  frequency: number
  actionTag: ActionTag
  trend: number
  ads: Ad[]
}

export interface Campaign {
  id: string
  clientId: string
  platform: Platform
  name: string
  type: CampaignType
  market: Market
  status: AdStatus
  objective: string
  dailyBudget: number
  spend: number
  purchaseValue: number
  roas: number
  ctr: number
  cpa: number
  cpc: number
  cpm: number
  impressions: number
  clicks: number
  conversions: number
  reach: number
  frequency: number
  actionTag: ActionTag
  trend: number
  adSets: AdSet[]
}

// ─── Creatives ──────────────────────────────────────────────────────────────

export interface Creative {
  id: string
  clientId: string
  platform: Platform
  name: string
  format: CreativeFormat
  thumbnailUrl: string
  previewUrl?: string
  spend: number
  purchaseValue: number
  roas: number
  ctr: number
  cpa: number
  impressions: number
  reach: number
  frequency: number
  trend: number
  isTopPerformer: boolean
  fatigueRisk: boolean
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

export interface Alert {
  id: string
  clientId: string
  platform: Platform
  type: AlertType
  severity: AlertSeverity
  campaignId?: string
  campaignName?: string
  adSetId?: string
  title: string
  message: string
  metric?: string
  metricValue?: number
  threshold?: number
  createdAt: string
  isRead: boolean
  actionRequired: boolean
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  meta?: {
    total?: number
    page?: number
    limit?: number
  }
}

export interface DashboardFilters {
  clientId: string
  dateRange: DateRange
  market: Market
  platform?: Platform
}
