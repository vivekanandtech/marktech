// Comprehensive mock data — replace with real API calls once tokens are available

export const CLIENTS = [
  { id: 'c1', name: 'Velora Fashion', industry: 'Fashion & Apparel', logoInitials: 'VF', logoColor: '#6366f1', totalSpend: 4523890, blendedRoas: 4.07 },
  { id: 'c2', name: 'NutriPeak', industry: 'Health & Supplements', logoInitials: 'NP', logoColor: '#10b981', totalSpend: 2187450, blendedRoas: 3.62 },
  { id: 'c3', name: 'GlowRoot Beauty', industry: 'D2C Beauty & Skincare', logoInitials: 'GR', logoColor: '#f59e0b', totalSpend: 1834200, blendedRoas: 5.21 },
]

export function getMockClients() {
  return CLIENTS
}

// ─── Summary Metrics ─────────────────────────────────────────────────────────

const BASE_METRICS: Record<string, Record<string, number>> = {
  c1: { adSpend: 4523890, netSales: 18423450, orders: 12847, attributedOrders: 10230, blendedRoas: 4.07, attributedRoas: 5.2, cac: 352, aov: 1434, sessions: 248900, cmRatio: 38.4, discountRate: 12.3, internationalRevenue: 3240000, reach: 1820000, cpm: 148, cpc: 22, ctr: 1.48, cpa: 442 },
  c2: { adSpend: 2187450, netSales: 7918470, orders: 6240, attributedOrders: 4980, blendedRoas: 3.62, attributedRoas: 4.8, cac: 441, aov: 1268, sessions: 128400, cmRatio: 32.1, discountRate: 8.7, internationalRevenue: 980000, reach: 890000, cpm: 168, cpc: 28, ctr: 1.21, cpa: 520 },
  c3: { adSpend: 1834200, netSales: 9558102, orders: 8920, attributedOrders: 7136, blendedRoas: 5.21, attributedRoas: 6.4, cac: 258, aov: 1071, sessions: 198700, cmRatio: 44.2, discountRate: 6.1, internationalRevenue: 2140000, reach: 1480000, cpm: 112, cpc: 16, ctr: 1.96, cpa: 318 },
}

const TREND_OVERRIDES: Record<string, Record<string, number>> = {
  c1: { adSpend: -3.2, netSales: 8.5, orders: 5.1, attributedOrders: 4.8, blendedRoas: 6.8, attributedRoas: 1.9, cac: -2.1, aov: 3.3, sessions: 12.0, cmRatio: 1.8, discountRate: -0.4, internationalRevenue: 14.2, reach: 9.3, cpm: -4.1, cpc: -2.8, ctr: 7.2, cpa: -5.4 },
  c2: { adSpend: 11.4, netSales: -4.2, orders: -3.8, attributedOrders: -2.9, blendedRoas: -14.0, attributedRoas: -8.6, cac: 12.8, aov: 1.2, sessions: -6.7, cmRatio: -2.1, discountRate: 1.8, internationalRevenue: 3.1, reach: 4.2, cpm: 8.9, cpc: 7.3, ctr: -5.8, cpa: 14.2 },
  c3: { adSpend: 6.8, netSales: 21.3, orders: 18.7, attributedOrders: 19.4, blendedRoas: 13.5, attributedRoas: 11.2, cac: -14.9, aov: 4.1, sessions: 28.4, cmRatio: 3.7, discountRate: -1.2, internationalRevenue: 32.8, reach: 22.6, cpm: -8.7, cpc: -11.3, ctr: 18.9, cpa: -16.2 },
}

function makeTrend(value: number, change: number, lowerIsBetter = false) {
  const improving = lowerIsBetter ? change < 0 : change > 0
  return { value, change, improving }
}

export function getMockSummaryMetrics(clientId: string, _dateRange: string, market: string) {
  const base = BASE_METRICS[clientId] ?? BASE_METRICS['c1']
  const trends = TREND_OVERRIDES[clientId] ?? TREND_OVERRIDES['c1']
  const marketMult = market === 'india' ? 0.72 : market === 'international' ? 0.28 : 1

  const s = (key: string) => base[key] * marketMult
  const t = (key: string) => trends[key]

  return {
    adSpend: makeTrend(s('adSpend'), t('adSpend')),
    netSales: makeTrend(s('netSales'), t('netSales')),
    orders: makeTrend(Math.round(s('orders')), t('orders')),
    attributedOrders: makeTrend(Math.round(s('attributedOrders')), t('attributedOrders')),
    blendedRoas: makeTrend(base['blendedRoas'], t('blendedRoas')),
    attributedRoas: makeTrend(base['attributedRoas'], t('attributedRoas')),
    cac: makeTrend(base['cac'], t('cac'), true),
    aov: makeTrend(base['aov'], t('aov')),
    sessions: makeTrend(Math.round(s('sessions')), t('sessions')),
    cmRatio: makeTrend(base['cmRatio'], t('cmRatio')),
    discountRate: makeTrend(base['discountRate'], t('discountRate'), true),
    internationalRevenue: makeTrend(s('internationalRevenue'), t('internationalRevenue')),
    reach: makeTrend(Math.round(s('reach')), t('reach')),
    cpm: makeTrend(base['cpm'], t('cpm'), true),
    cpc: makeTrend(base['cpc'], t('cpc'), true),
    ctr: makeTrend(base['ctr'], t('ctr')),
    cpa: makeTrend(base['cpa'], t('cpa'), true),
    newCustomerRate: makeTrend(68.4, 3.2),
  }
}

// ─── Chart Data ──────────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function genPoint(dayIndex: number, clientId: string, market: string) {
  const seed = dayIndex * 7 + (clientId === 'c1' ? 0 : clientId === 'c2' ? 100 : 200)
  const rand = (offset = 0) => seededRandom(seed + offset)
  const base = BASE_METRICS[clientId] ?? BASE_METRICS['c1']
  const mkt = market === 'india' ? 0.72 : market === 'international' ? 0.28 : 1

  const dailySpend = (base['adSpend'] / 30) * mkt * (0.8 + rand(0) * 0.4)
  const dailySales = dailySpend * base['blendedRoas'] * (0.85 + rand(1) * 0.3)
  const metaShare = 0.62 + rand(2) * 0.08
  return {
    adSpend: Math.round(dailySpend),
    netSales: Math.round(dailySales),
    blendedRoas: parseFloat((dailySales / dailySpend).toFixed(2)),
    attributedRoas: parseFloat((dailySales / dailySpend * 1.28).toFixed(2)),
    conversionRate: parseFloat((1.2 + rand(3) * 1.4).toFixed(2)),
    sessions: Math.round((base['sessions'] / 30) * mkt * (0.7 + rand(4) * 0.6)),
    metaSpend: Math.round(dailySpend * metaShare),
    googleSpend: Math.round(dailySpend * (1 - metaShare)),
  }
}

export function getMockChartData(clientId: string, dateRange: string, market: string) {
  const days = { '1D': 1, '3D': 3, '7D': 7, '14D': 14, '30D': 30, '3M': 90, '6M': 180, '1Y': 365 }[dateRange] ?? 30
  const result = []
  const now = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const label = days <= 14
      ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      : days <= 90
        ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        : d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
    result.push({ date: label, ...genPoint(i, clientId, market) })
  }
  return result
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

const ALL_CAMPAIGNS = {
  c1: [
    {
      id: 'cp1', clientId: 'c1', platform: 'meta', name: 'Advantage+ Shopping — India', type: 'advantage_plus', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 80000, spend: 980450, purchaseValue: 4706160, roas: 4.80, ctr: 2.14, cpa: 384, cpc: 18.2, cpm: 132, impressions: 538710, clicks: 53871, conversions: 2553, reach: 420000, frequency: 1.28, actionTag: 'scale', trend: 12.4,
      adSets: [
        {
          id: 'as1', campaignId: 'cp1', name: 'Broad — Women 25-45', audience: 'Broad targeting — Women 25–45, Metro India', status: 'active', budget: 50000, spend: 612000, purchaseValue: 3060000, roas: 5.00, ctr: 2.38, cpa: 348, cpc: 14.6, cpm: 118, impressions: 418904, clicks: 41890, conversions: 1759, reach: 310000, frequency: 1.35, actionTag: 'scale', trend: 15.2,
          ads: [
            { id: 'ad1', adSetId: 'as1', name: 'Summer Collection — Video', format: 'video', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-v1/400/500', spend: 368000, purchaseValue: 1988000, roas: 5.40, ctr: 2.8, cpa: 312, cpc: 11.1, cpm: 98, impressions: 331531, clicks: 33153, conversions: 1179, reach: 258000, frequency: 1.28, actionTag: 'scale', trend: 18.6 },
            { id: 'ad2', adSetId: 'as1', name: 'Ethnic Range — Carousel', format: 'carousel', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-c1/400/500', spend: 244000, purchaseValue: 1072000, roas: 4.39, ctr: 1.7, cpa: 420, cpc: 19.8, cpm: 148, impressions: 87373, clicks: 8737, conversions: 580, reach: 52000, frequency: 1.68, actionTag: 'watch', trend: 4.2 },
          ],
        },
        {
          id: 'as2', campaignId: 'cp1', name: 'Interest — Fashion Enthusiasts', audience: 'Fashion, Shopping, Zara, H&M interests — Women 22-40', status: 'active', budget: 30000, spend: 368450, purchaseValue: 1620780, roas: 4.40, ctr: 1.84, cpa: 448, cpc: 24.3, cpm: 162, impressions: 119806, clicks: 11980, conversions: 823, reach: 110000, frequency: 1.09, actionTag: 'watch', trend: 6.8,
          ads: [
            { id: 'ad3', adSetId: 'as2', name: 'New Arrivals Reel', format: 'reel', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-r1/400/500', spend: 198000, purchaseValue: 930600, roas: 4.70, ctr: 2.1, cpa: 408, cpc: 19.4, cpm: 144, impressions: 68750, clicks: 6875, conversions: 485, reach: 62000, frequency: 1.11, actionTag: 'watch', trend: 8.9 },
            { id: 'ad4', adSetId: 'as2', name: 'Sale Static Banner', format: 'image', status: 'paused', thumbnailUrl: 'https://picsum.photos/seed/velora-i1/400/500', spend: 170450, purchaseValue: 690180, roas: 4.05, ctr: 1.4, cpa: 502, cpc: 35.8, cpm: 198, impressions: 51056, clicks: 5106, conversions: 340, reach: 48000, frequency: 1.06, actionTag: 'optimise', trend: -2.1 },
          ],
        },
      ],
    },
    {
      id: 'cp2', clientId: 'c1', platform: 'meta', name: 'Lookalike 1–3% — Purchase (India)', type: 'lookalike', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 40000, spend: 487200, purchaseValue: 2095560, roas: 4.30, ctr: 1.62, cpa: 498, cpc: 30.7, cpm: 176, impressions: 277386, clicks: 15870, conversions: 978, reach: 238000, frequency: 1.16, actionTag: 'watch', trend: 3.8,
      adSets: [
        {
          id: 'as3', campaignId: 'cp2', name: 'LAL 1% — Top Purchasers', audience: '1% Lookalike of last 90-day purchasers — India', status: 'active', budget: 25000, spend: 298000, purchaseValue: 1369800, roas: 4.60, ctr: 1.88, cpa: 442, cpc: 23.5, cpm: 158, impressions: 188607, clicks: 12684, conversions: 674, reach: 162000, frequency: 1.16, actionTag: 'watch', trend: 7.2,
          ads: [
            { id: 'ad5', adSetId: 'as3', name: 'Brand Story Video', format: 'video', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-v2/400/500', spend: 298000, purchaseValue: 1369800, roas: 4.60, ctr: 1.88, cpa: 442, cpc: 23.5, cpm: 158, impressions: 188607, clicks: 12684, conversions: 674, reach: 162000, frequency: 1.16, actionTag: 'watch', trend: 7.2 },
          ],
        },
        {
          id: 'as4', campaignId: 'cp2', name: 'LAL 2–3% — Category Visitors', audience: '2–3% Lookalike of website visitors — 60 days', status: 'active', budget: 15000, spend: 189200, purchaseValue: 725860, roas: 3.84, ctr: 1.12, cpa: 602, cpc: 53.7, cpm: 212, impressions: 88806, clicks: 3522, conversions: 314, reach: 76000, frequency: 1.17, actionTag: 'optimise', trend: -4.6,
          ads: [
            { id: 'ad6', adSetId: 'as4', name: 'Category Carousel', format: 'carousel', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-c2/400/500', spend: 189200, purchaseValue: 725860, roas: 3.84, ctr: 1.12, cpa: 602, cpc: 53.7, cpm: 212, impressions: 88806, clicks: 3522, conversions: 314, reach: 76000, frequency: 1.17, actionTag: 'optimise', trend: -4.6 },
          ],
        },
      ],
    },
    {
      id: 'cp3', clientId: 'c1', platform: 'meta', name: 'Retargeting — 30D Visitors (India)', type: 'retargeting', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 20000, spend: 214780, purchaseValue: 1438026, roas: 6.70, ctr: 3.48, cpa: 284, cpc: 8.2, cpm: 88, impressions: 244068, clicks: 26173, conversions: 756, reach: 98000, frequency: 2.49, actionTag: 'scale', trend: 22.1,
      adSets: [
        {
          id: 'as5', campaignId: 'cp3', name: 'Product Page Visitors — 7D', audience: 'Product page visitors last 7 days — India', status: 'active', budget: 12000, spend: 128400, purchaseValue: 924480, roas: 7.20, ctr: 3.92, cpa: 248, cpc: 6.3, cpm: 74, impressions: 173514, clicks: 20384, conversions: 518, reach: 58000, frequency: 2.99, actionTag: 'scale', trend: 28.4,
          ads: [
            { id: 'ad7', adSetId: 'as5', name: 'Dynamic Product Carousel', format: 'carousel', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-rtg1/400/500', spend: 128400, purchaseValue: 924480, roas: 7.20, ctr: 3.92, cpa: 248, cpc: 6.3, cpm: 74, impressions: 173514, clicks: 20384, conversions: 518, reach: 58000, frequency: 2.99, actionTag: 'scale', trend: 28.4 },
          ],
        },
        {
          id: 'as6', campaignId: 'cp3', name: 'Cart Abandoners — 14D', audience: 'Add to cart but no purchase — last 14 days', status: 'active', budget: 8000, spend: 86380, purchaseValue: 513658, roas: 5.95, ctr: 2.88, cpa: 337, cpc: 11.7, cpm: 112, impressions: 70554, clicks: 7390, conversions: 257, reach: 40000, frequency: 1.76, actionTag: 'scale', trend: 14.8,
          ads: [
            { id: 'ad8', adSetId: 'as6', name: 'Urgency — Limited Stock', format: 'image', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-rtg2/400/500', spend: 86380, purchaseValue: 513658, roas: 5.95, ctr: 2.88, cpa: 337, cpc: 11.7, cpm: 112, impressions: 70554, clicks: 7390, conversions: 257, reach: 40000, frequency: 1.76, actionTag: 'scale', trend: 14.8 },
          ],
        },
      ],
    },
    {
      id: 'cp4', clientId: 'c1', platform: 'meta', name: 'LAL 3–6% — UAE & Gulf Market', type: 'lookalike', market: 'international', status: 'active', objective: 'Conversions', dailyBudget: 18000, spend: 182340, purchaseValue: 730260, roas: 4.00, ctr: 1.42, cpa: 562, cpc: 38.4, cpm: 188, impressions: 96990, clicks: 4748, conversions: 324, reach: 84000, frequency: 1.15, actionTag: 'watch', trend: -1.8,
      adSets: [
        {
          id: 'as7', campaignId: 'cp4', name: 'Gulf — Women Fashion', audience: '3–6% LAL UAE/KSA/Qatar purchasers', status: 'active', budget: 18000, spend: 182340, purchaseValue: 730260, roas: 4.00, ctr: 1.42, cpa: 562, cpc: 38.4, cpm: 188, impressions: 96990, clicks: 4748, conversions: 324, reach: 84000, frequency: 1.15, actionTag: 'watch', trend: -1.8,
          ads: [
            { id: 'ad9', adSetId: 'as7', name: 'Festive Collection Reel', format: 'reel', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-intl1/400/500', spend: 182340, purchaseValue: 730260, roas: 4.00, ctr: 1.42, cpa: 562, cpc: 38.4, cpm: 188, impressions: 96990, clicks: 4748, conversions: 324, reach: 84000, frequency: 1.15, actionTag: 'watch', trend: -1.8 },
          ],
        },
      ],
    },
    {
      id: 'cp5', clientId: 'c1', platform: 'google', name: 'Search — Brand Terms (India)', type: 'prospecting', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 15000, spend: 248600, purchaseValue: 1591040, roas: 6.40, ctr: 8.24, cpa: 218, cpc: 26.4, cpm: 0, impressions: 9416, clicks: 9416, conversions: 1141, reach: 0, frequency: 0, actionTag: 'scale', trend: 9.3,
      adSets: [
        {
          id: 'as8', campaignId: 'cp5', name: 'Brand Exact — Core', audience: 'Exact match brand keywords', status: 'active', budget: 15000, spend: 248600, purchaseValue: 1591040, roas: 6.40, ctr: 8.24, cpa: 218, cpc: 26.4, cpm: 0, impressions: 9416, clicks: 9416, conversions: 1141, reach: 0, frequency: 0, actionTag: 'scale', trend: 9.3,
          ads: [
            { id: 'ad10', adSetId: 'as8', name: 'Velora Brand RSA', format: 'image', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-g1/400/400', spend: 248600, purchaseValue: 1591040, roas: 6.40, ctr: 8.24, cpa: 218, cpc: 26.4, cpm: 0, impressions: 9416, clicks: 9416, conversions: 1141, reach: 0, frequency: 0, actionTag: 'scale', trend: 9.3 },
          ],
        },
      ],
    },
    {
      id: 'cp6', clientId: 'c1', platform: 'google', name: 'Shopping — India', type: 'prospecting', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 30000, spend: 409920, purchaseValue: 1762066, roas: 4.30, ctr: 1.82, cpa: 398, cpc: 21.9, cpm: 0, impressions: 225245, clicks: 18724, conversions: 1030, reach: 0, frequency: 0, actionTag: 'watch', trend: 4.1,
      adSets: [
        {
          id: 'as9', campaignId: 'cp6', name: 'All Products — Smart Shopping', audience: 'All products feed — India', status: 'active', budget: 30000, spend: 409920, purchaseValue: 1762066, roas: 4.30, ctr: 1.82, cpa: 398, cpc: 21.9, cpm: 0, impressions: 225245, clicks: 18724, conversions: 1030, reach: 0, frequency: 0, actionTag: 'watch', trend: 4.1,
          ads: [
            { id: 'ad11', adSetId: 'as9', name: 'Shopping PMax', format: 'image', status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-g2/400/400', spend: 409920, purchaseValue: 1762066, roas: 4.30, ctr: 1.82, cpa: 398, cpc: 21.9, cpm: 0, impressions: 225245, clicks: 18724, conversions: 1030, reach: 0, frequency: 0, actionTag: 'watch', trend: 4.1 },
          ],
        },
      ],
    },
  ],
}

export function getMockCampaigns(clientId: string, platform: string, market: string, _dateRange: string) {
  const campaigns = ALL_CAMPAIGNS[clientId as keyof typeof ALL_CAMPAIGNS] ?? ALL_CAMPAIGNS['c1']
  return campaigns.filter((c) => {
    const platMatch = !platform || platform === 'all' || c.platform === platform
    const mktMatch = !market || market === 'all' || c.market === market || c.market === 'all'
    return platMatch && mktMatch
  })
}

// ─── Creatives ───────────────────────────────────────────────────────────────

export function getMockCreatives(clientId: string, _platform: string, _dateRange: string) {
  const seeds = clientId === 'c1' ? ['velora-v1', 'velora-rtg1', 'velora-r1', 'velora-c1', 'velora-v2', 'velora-intl1', 'velora-rtg2', 'velora-c2']
    : clientId === 'c2' ? ['nutri-v1', 'nutri-c1', 'nutri-r1', 'nutri-i1', 'nutri-v2', 'nutri-i2']
      : ['glow-v1', 'glow-r1', 'glow-c1', 'glow-i1', 'glow-v2', 'glow-r2']

  const formats: Array<'video' | 'image' | 'carousel' | 'reel'> = ['video', 'carousel', 'reel', 'carousel', 'video', 'image', 'image', 'carousel']
  const names = ['Summer Collection Hero', 'Dynamic Product Reel', 'New Arrivals Story', 'Category Showcase', 'Brand Story Cut', 'Festive Lookbook', 'Urgency — Limited Stock', 'Ethnic Range Multi']

  return seeds.map((seed, i) => ({
    id: `cr_${clientId}_${i}`,
    clientId,
    platform: 'meta',
    name: names[i] ?? `Creative ${i + 1}`,
    format: formats[i] ?? 'image',
    thumbnailUrl: `https://picsum.photos/seed/${seed}/400/500`,
    spend: Math.round(80000 + seededRandom(i * 13 + 7) * 350000),
    purchaseValue: Math.round(400000 + seededRandom(i * 11 + 3) * 1800000),
    roas: parseFloat((3.2 + seededRandom(i * 9 + 1) * 4.2).toFixed(2)),
    ctr: parseFloat((0.8 + seededRandom(i * 7 + 2) * 2.8).toFixed(2)),
    cpa: Math.round(240 + seededRandom(i * 5 + 4) * 480),
    impressions: Math.round(40000 + seededRandom(i * 17 + 6) * 280000),
    reach: Math.round(30000 + seededRandom(i * 19 + 8) * 200000),
    frequency: parseFloat((1.1 + seededRandom(i * 23 + 5) * 3.2).toFixed(1)),
    trend: parseFloat((-18 + seededRandom(i * 3 + 9) * 48).toFixed(1)),
    isTopPerformer: i < 3,
    fatigueRisk: seededRandom(i * 29) > 0.7,
  }))
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export function getMockAlerts(clientId: string) {
  const now = new Date()
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString()

  return [
    { id: 'al1', clientId, platform: 'meta', type: 'creative_fatigue', severity: 'warning', campaignId: 'cp2', campaignName: 'Lookalike 1–3% — Purchase (India)', title: 'Creative Fatigue Detected', message: 'Ad "Category Carousel" frequency has reached 3.8 in the last 7 days. CTR dropped 24% week-over-week. Consider refreshing creative to prevent ROAS decline.', metric: 'frequency', metricValue: 3.8, threshold: 3.5, createdAt: hoursAgo(2), isRead: false, actionRequired: true },
    { id: 'al2', clientId, platform: 'meta', type: 'high_performer', severity: 'info', campaignId: 'cp3', campaignName: 'Retargeting — 30D Visitors', title: 'High Performer Opportunity', message: 'Retargeting campaign is delivering 7.2x ROAS — 51% above account target. Impression share is high but audience may saturate in 5–7 days. Consider expanding audience window to 45 days.', metric: 'roas', metricValue: 7.2, threshold: 4.8, createdAt: hoursAgo(4), isRead: false, actionRequired: false },
    { id: 'al3', clientId, platform: 'meta', type: 'roas_drop', severity: 'critical', campaignId: 'cp4', campaignName: 'LAL 3–6% — UAE & Gulf', title: 'ROAS Below Target', message: 'Gulf campaign ROAS dropped to 4.0x — 16% below the 4.8x target. CPA increased ₹92 over the last 3 days. Campaign is spending ₹6,100/day. Recommend pausing until creative refresh.', metric: 'roas', metricValue: 4.0, threshold: 4.8, createdAt: hoursAgo(1), isRead: false, actionRequired: true },
    { id: 'al4', clientId, platform: 'google', type: 'budget_cap', severity: 'warning', campaignId: 'cp6', campaignName: 'Shopping — India', title: 'Budget Capping Mid-Day', message: 'Shopping campaign exhausted its ₹30,000 daily budget by 2:30 PM IST. Impression share lost to budget: 34%. Campaign ROAS is 4.3x — above target. Recommend increasing budget by ₹8,000–10,000/day.', createdAt: hoursAgo(6), isRead: true, actionRequired: true },
    { id: 'al5', clientId, platform: 'meta', type: 'learning_phase', severity: 'info', campaignId: 'cp1', campaignName: 'Advantage+ Shopping — India', title: 'Learning Phase Complete', message: 'Advantage+ campaign has exited the learning phase after 7 days and 52 optimization events. Performance is now stable. Avoid budget or audience changes for the next 3 days to maintain momentum.', createdAt: hoursAgo(12), isRead: true, actionRequired: false },
  ]
}
