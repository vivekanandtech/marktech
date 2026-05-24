// All mock data is self-contained — no API call needed for development
// Swap these functions for real API calls once Meta/Google tokens are ready

export const CLIENTS = [
  { id: 'c1', name: 'Velora Fashion', industry: 'Fashion & Apparel', logoInitials: 'VF', logoColor: '#6366f1', totalSpend: 4523890, blendedRoas: 4.07 },
  { id: 'c2', name: 'NutriPeak', industry: 'Health & Supplements', logoInitials: 'NP', logoColor: '#10b981', totalSpend: 2187450, blendedRoas: 3.62 },
  { id: 'c3', name: 'GlowRoot Beauty', industry: 'D2C Beauty & Skincare', logoInitials: 'GR', logoColor: '#f59e0b', totalSpend: 1834200, blendedRoas: 5.21 },
]

// ─── Seeded random ───────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

// ─── Summary Metrics ─────────────────────────────────────────────────────────

const BASE: Record<string, Record<string, number>> = {
  c1: { adSpend: 4523890, netSales: 18423450, orders: 12847, attributedOrders: 10230, blendedRoas: 4.07, attributedRoas: 5.20, cac: 352, aov: 1434, sessions: 248900, cmRatio: 38.4, discountRate: 12.3, internationalRevenue: 3240000, reach: 1820000, cpm: 148, cpc: 22, ctr: 1.48, cpa: 442 },
  c2: { adSpend: 2187450, netSales: 7918470, orders: 6240, attributedOrders: 4980, blendedRoas: 3.62, attributedRoas: 4.80, cac: 441, aov: 1268, sessions: 128400, cmRatio: 32.1, discountRate: 8.7, internationalRevenue: 980000, reach: 890000, cpm: 168, cpc: 28, ctr: 1.21, cpa: 520 },
  c3: { adSpend: 1834200, netSales: 9558102, orders: 8920, attributedOrders: 7136, blendedRoas: 5.21, attributedRoas: 6.40, cac: 258, aov: 1071, sessions: 198700, cmRatio: 44.2, discountRate: 6.1, internationalRevenue: 2140000, reach: 1480000, cpm: 112, cpc: 16, ctr: 1.96, cpa: 318 },
}

const TRENDS: Record<string, Record<string, number>> = {
  c1: { adSpend: -3.2, netSales: 8.5, orders: 5.1, attributedOrders: 4.8, blendedRoas: 6.8, attributedRoas: 1.9, cac: -2.1, aov: 3.3, sessions: 12.0, cmRatio: 1.8, discountRate: -0.4, internationalRevenue: 14.2, reach: 9.3, cpm: -4.1, cpc: -2.8, ctr: 7.2, cpa: -5.4 },
  c2: { adSpend: 11.4, netSales: -4.2, orders: -3.8, attributedOrders: -2.9, blendedRoas: -14.0, attributedRoas: -8.6, cac: 12.8, aov: 1.2, sessions: -6.7, cmRatio: -2.1, discountRate: 1.8, internationalRevenue: 3.1, reach: 4.2, cpm: 8.9, cpc: 7.3, ctr: -5.8, cpa: 14.2 },
  c3: { adSpend: 6.8, netSales: 21.3, orders: 18.7, attributedOrders: 19.4, blendedRoas: 13.5, attributedRoas: 11.2, cac: -14.9, aov: 4.1, sessions: 28.4, cmRatio: 3.7, discountRate: -1.2, internationalRevenue: 32.8, reach: 22.6, cpm: -8.7, cpc: -11.3, ctr: 18.9, cpa: -16.2 },
}

function tv(value: number, change: number, lowerIsBetter = false) {
  return { value, change, improving: lowerIsBetter ? change < 0 : change > 0 }
}

export function getSummaryMetrics(clientId: string, market: string) {
  const b = BASE[clientId] ?? BASE['c1']
  const t = TRENDS[clientId] ?? TRENDS['c1']
  const m = market === 'india' ? 0.72 : market === 'international' ? 0.28 : 1
  const s = (k: string) => b[k] * m

  return {
    adSpend: tv(s('adSpend'), t['adSpend']),
    netSales: tv(s('netSales'), t['netSales']),
    orders: tv(Math.round(s('orders')), t['orders']),
    attributedOrders: tv(Math.round(s('attributedOrders')), t['attributedOrders']),
    blendedRoas: tv(b['blendedRoas'], t['blendedRoas']),
    attributedRoas: tv(b['attributedRoas'], t['attributedRoas']),
    cac: tv(b['cac'], t['cac'], true),
    aov: tv(b['aov'], t['aov']),
    sessions: tv(Math.round(s('sessions')), t['sessions']),
    cmRatio: tv(b['cmRatio'], t['cmRatio']),
    discountRate: tv(b['discountRate'], t['discountRate'], true),
    internationalRevenue: tv(s('internationalRevenue'), t['internationalRevenue']),
    reach: tv(Math.round(s('reach')), t['reach']),
    cpm: tv(b['cpm'], t['cpm'], true),
    cpc: tv(b['cpc'], t['cpc'], true),
    ctr: tv(b['ctr'], t['ctr']),
    cpa: tv(b['cpa'], t['cpa'], true),
    newCustomerRate: tv(68.4, 3.2),
  }
}

// ─── Chart Data ──────────────────────────────────────────────────────────────

const DAYS_MAP: Record<string, number> = {
  '1D': 1, '3D': 3, '7D': 7, '14D': 14, '30D': 30, '3M': 90, '6M': 180, '1Y': 365,
}

export function getChartData(clientId: string, dateRange: string, market: string) {
  const days = DAYS_MAP[dateRange] ?? 30
  const b = BASE[clientId] ?? BASE['c1']
  const mkt = market === 'india' ? 0.72 : market === 'international' ? 0.28 : 1
  const now = new Date()
  const result = []

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const seed = i * 7 + (clientId === 'c1' ? 0 : clientId === 'c2' ? 100 : 200)
    const rand = (o = 0) => seededRandom(seed + o)

    const dailySpend = (b['adSpend'] / 30) * mkt * (0.8 + rand(0) * 0.4)
    const dailySales = dailySpend * b['blendedRoas'] * (0.85 + rand(1) * 0.3)
    const metaShare = 0.62 + rand(2) * 0.08

    let label: string
    if (days <= 14) label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    else if (days <= 90) label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    else label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

    result.push({
      date: label,
      adSpend: Math.round(dailySpend),
      netSales: Math.round(dailySales),
      blendedRoas: parseFloat((dailySales / dailySpend).toFixed(2)),
      attributedRoas: parseFloat((dailySales / dailySpend * 1.28).toFixed(2)),
      conversionRate: parseFloat((1.2 + rand(3) * 1.4).toFixed(2)),
      sessions: Math.round((b['sessions'] / 30) * mkt * (0.7 + rand(4) * 0.6)),
      metaSpend: Math.round(dailySpend * metaShare),
      googleSpend: Math.round(dailySpend * (1 - metaShare)),
    })
  }
  return result
}

export function getFormatBreakdown(clientId: string) {
  const b = BASE[clientId] ?? BASE['c1']
  const total = b['adSpend']
  return [
    { format: 'Video', spend: Math.round(total * 0.42), roas: 5.2, impressions: Math.round(b['reach'] * 0.48) },
    { format: 'Carousel', spend: Math.round(total * 0.28), roas: 4.1, impressions: Math.round(b['reach'] * 0.30) },
    { format: 'Reel', spend: Math.round(total * 0.18), roas: 4.8, impressions: Math.round(b['reach'] * 0.16) },
    { format: 'Image', spend: Math.round(total * 0.12), roas: 3.4, impressions: Math.round(b['reach'] * 0.06) },
  ]
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export const ALL_CAMPAIGNS = {
  c1: [
    {
      id: 'cp1', clientId: 'c1', platform: 'meta', name: 'Advantage+ Shopping — India', type: 'advantage_plus', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 80000, spend: 980450, purchaseValue: 4706160, roas: 4.80, ctr: 2.14, cpa: 384, cpc: 18.2, cpm: 132, impressions: 53871, clicks: 53871, conversions: 2553, reach: 420000, frequency: 1.28, actionTag: 'scale' as const, trend: 12.4,
      adSets: [
        {
          id: 'as1', campaignId: 'cp1', name: 'Broad — Women 25–45', audience: 'Broad targeting, Women 25–45, Metro India', status: 'active', budget: 50000, spend: 612000, purchaseValue: 3060000, roas: 5.00, ctr: 2.38, cpa: 348, cpc: 14.6, cpm: 118, impressions: 41890, clicks: 41890, conversions: 1759, reach: 310000, frequency: 1.35, actionTag: 'scale' as const, trend: 15.2,
          ads: [
            { id: 'ad1', adSetId: 'as1', name: 'Summer Collection — Video', format: 'video' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-v1/300/400', spend: 368000, purchaseValue: 1988000, roas: 5.40, ctr: 2.8, cpa: 312, cpc: 11.1, cpm: 98, impressions: 33153, clicks: 33153, conversions: 1179, reach: 258000, frequency: 1.28, actionTag: 'scale' as const, trend: 18.6 },
            { id: 'ad2', adSetId: 'as1', name: 'Ethnic Range — Carousel', format: 'carousel' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-c1/300/400', spend: 244000, purchaseValue: 1072000, roas: 4.39, ctr: 1.7, cpa: 420, cpc: 19.8, cpm: 148, impressions: 8737, clicks: 8737, conversions: 580, reach: 52000, frequency: 1.68, actionTag: 'watch' as const, trend: 4.2 },
          ],
        },
        {
          id: 'as2', campaignId: 'cp1', name: 'Interest — Fashion Enthusiasts', audience: 'Fashion, Shopping, Lifestyle interests — Women 22–40', status: 'active', budget: 30000, spend: 368450, purchaseValue: 1620780, roas: 4.40, ctr: 1.84, cpa: 448, cpc: 24.3, cpm: 162, impressions: 11980, clicks: 11980, conversions: 823, reach: 110000, frequency: 1.09, actionTag: 'watch' as const, trend: 6.8,
          ads: [
            { id: 'ad3', adSetId: 'as2', name: 'New Arrivals — Reel', format: 'reel' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-r1/300/400', spend: 198000, purchaseValue: 930600, roas: 4.70, ctr: 2.1, cpa: 408, cpc: 19.4, cpm: 144, impressions: 6875, clicks: 6875, conversions: 485, reach: 62000, frequency: 1.11, actionTag: 'watch' as const, trend: 8.9 },
            { id: 'ad4', adSetId: 'as2', name: 'Sale Static Banner', format: 'image' as const, status: 'paused', thumbnailUrl: 'https://picsum.photos/seed/velora-i1/300/400', spend: 170450, purchaseValue: 690180, roas: 4.05, ctr: 1.4, cpa: 502, cpc: 35.8, cpm: 198, impressions: 5106, clicks: 5106, conversions: 340, reach: 48000, frequency: 1.06, actionTag: 'optimise' as const, trend: -2.1 },
          ],
        },
      ],
    },
    {
      id: 'cp2', clientId: 'c1', platform: 'meta', name: 'Lookalike 1–3% — Purchase (India)', type: 'lookalike', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 40000, spend: 487200, purchaseValue: 2095560, roas: 4.30, ctr: 1.62, cpa: 498, cpc: 30.7, cpm: 176, impressions: 15870, clicks: 15870, conversions: 978, reach: 238000, frequency: 1.16, actionTag: 'watch' as const, trend: 3.8,
      adSets: [
        {
          id: 'as3', campaignId: 'cp2', name: 'LAL 1% — Top Purchasers', audience: '1% Lookalike of 90-day purchasers — India', status: 'active', budget: 25000, spend: 298000, purchaseValue: 1369800, roas: 4.60, ctr: 1.88, cpa: 442, cpc: 23.5, cpm: 158, impressions: 12684, clicks: 12684, conversions: 674, reach: 162000, frequency: 1.16, actionTag: 'watch' as const, trend: 7.2,
          ads: [
            { id: 'ad5', adSetId: 'as3', name: 'Brand Story — Video', format: 'video' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-v2/300/400', spend: 298000, purchaseValue: 1369800, roas: 4.60, ctr: 1.88, cpa: 442, cpc: 23.5, cpm: 158, impressions: 12684, clicks: 12684, conversions: 674, reach: 162000, frequency: 1.16, actionTag: 'watch' as const, trend: 7.2 },
          ],
        },
        {
          id: 'as4', campaignId: 'cp2', name: 'LAL 2–3% — Category Visitors', audience: '2–3% Lookalike of 60-day website visitors', status: 'active', budget: 15000, spend: 189200, purchaseValue: 725860, roas: 3.84, ctr: 1.12, cpa: 602, cpc: 53.7, cpm: 212, impressions: 3522, clicks: 3522, conversions: 314, reach: 76000, frequency: 1.17, actionTag: 'optimise' as const, trend: -4.6,
          ads: [
            { id: 'ad6', adSetId: 'as4', name: 'Category Showcase — Carousel', format: 'carousel' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-c2/300/400', spend: 189200, purchaseValue: 725860, roas: 3.84, ctr: 1.12, cpa: 602, cpc: 53.7, cpm: 212, impressions: 3522, clicks: 3522, conversions: 314, reach: 76000, frequency: 3.82, actionTag: 'optimise' as const, trend: -4.6 },
          ],
        },
      ],
    },
    {
      id: 'cp3', clientId: 'c1', platform: 'meta', name: 'Retargeting — 30D Visitors (India)', type: 'retargeting', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 20000, spend: 214780, purchaseValue: 1438026, roas: 6.70, ctr: 3.48, cpa: 284, cpc: 8.2, cpm: 88, impressions: 26173, clicks: 26173, conversions: 756, reach: 98000, frequency: 2.49, actionTag: 'scale' as const, trend: 22.1,
      adSets: [
        {
          id: 'as5', campaignId: 'cp3', name: 'Product Page Visitors — 7D', audience: 'Product page visitors, last 7 days — India', status: 'active', budget: 12000, spend: 128400, purchaseValue: 924480, roas: 7.20, ctr: 3.92, cpa: 248, cpc: 6.3, cpm: 74, impressions: 20384, clicks: 20384, conversions: 518, reach: 58000, frequency: 2.99, actionTag: 'scale' as const, trend: 28.4,
          ads: [
            { id: 'ad7', adSetId: 'as5', name: 'Dynamic Product Carousel', format: 'carousel' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-rtg1/300/400', spend: 128400, purchaseValue: 924480, roas: 7.20, ctr: 3.92, cpa: 248, cpc: 6.3, cpm: 74, impressions: 20384, clicks: 20384, conversions: 518, reach: 58000, frequency: 2.99, actionTag: 'scale' as const, trend: 28.4 },
          ],
        },
        {
          id: 'as6', campaignId: 'cp3', name: 'Cart Abandoners — 14D', audience: 'Added to cart, no purchase — last 14 days', status: 'active', budget: 8000, spend: 86380, purchaseValue: 513658, roas: 5.95, ctr: 2.88, cpa: 337, cpc: 11.7, cpm: 112, impressions: 7390, clicks: 7390, conversions: 257, reach: 40000, frequency: 1.76, actionTag: 'scale' as const, trend: 14.8,
          ads: [
            { id: 'ad8', adSetId: 'as6', name: 'Urgency — Limited Stock', format: 'image' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-rtg2/300/400', spend: 86380, purchaseValue: 513658, roas: 5.95, ctr: 2.88, cpa: 337, cpc: 11.7, cpm: 112, impressions: 7390, clicks: 7390, conversions: 257, reach: 40000, frequency: 1.76, actionTag: 'scale' as const, trend: 14.8 },
          ],
        },
      ],
    },
    {
      id: 'cp4', clientId: 'c1', platform: 'meta', name: 'LAL 3–6% — UAE & Gulf', type: 'lookalike', market: 'international', status: 'active', objective: 'Conversions', dailyBudget: 18000, spend: 182340, purchaseValue: 730260, roas: 4.00, ctr: 1.42, cpa: 562, cpc: 38.4, cpm: 188, impressions: 4748, clicks: 4748, conversions: 324, reach: 84000, frequency: 1.15, actionTag: 'watch' as const, trend: -1.8,
      adSets: [
        {
          id: 'as7', campaignId: 'cp4', name: 'Gulf — Women Fashion', audience: '3–6% LAL UAE/KSA/Qatar purchasers', status: 'active', budget: 18000, spend: 182340, purchaseValue: 730260, roas: 4.00, ctr: 1.42, cpa: 562, cpc: 38.4, cpm: 188, impressions: 4748, clicks: 4748, conversions: 324, reach: 84000, frequency: 1.15, actionTag: 'watch' as const, trend: -1.8,
          ads: [
            { id: 'ad9', adSetId: 'as7', name: 'Festive Lookbook — Reel', format: 'reel' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-intl1/300/400', spend: 182340, purchaseValue: 730260, roas: 4.00, ctr: 1.42, cpa: 562, cpc: 38.4, cpm: 188, impressions: 4748, clicks: 4748, conversions: 324, reach: 84000, frequency: 1.15, actionTag: 'watch' as const, trend: -1.8 },
          ],
        },
      ],
    },
    {
      id: 'cp5', clientId: 'c1', platform: 'google', name: 'Search — Brand Terms (India)', type: 'prospecting', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 15000, spend: 248600, purchaseValue: 1591040, roas: 6.40, ctr: 8.24, cpa: 218, cpc: 26.4, cpm: 0, impressions: 9416, clicks: 9416, conversions: 1141, reach: 0, frequency: 0, actionTag: 'scale' as const, trend: 9.3,
      adSets: [
        {
          id: 'as8', campaignId: 'cp5', name: 'Brand Exact Match', audience: 'Exact match brand keywords', status: 'active', budget: 15000, spend: 248600, purchaseValue: 1591040, roas: 6.40, ctr: 8.24, cpa: 218, cpc: 26.4, cpm: 0, impressions: 9416, clicks: 9416, conversions: 1141, reach: 0, frequency: 0, actionTag: 'scale' as const, trend: 9.3,
          ads: [
            { id: 'ad10', adSetId: 'as8', name: 'Velora Brand RSA', format: 'image' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-g1/300/300', spend: 248600, purchaseValue: 1591040, roas: 6.40, ctr: 8.24, cpa: 218, cpc: 26.4, cpm: 0, impressions: 9416, clicks: 9416, conversions: 1141, reach: 0, frequency: 0, actionTag: 'scale' as const, trend: 9.3 },
          ],
        },
      ],
    },
    {
      id: 'cp6', clientId: 'c1', platform: 'google', name: 'Shopping — PMax India', type: 'prospecting', market: 'india', status: 'active', objective: 'Conversions', dailyBudget: 30000, spend: 409920, purchaseValue: 1762066, roas: 4.30, ctr: 1.82, cpa: 398, cpc: 21.9, cpm: 0, impressions: 18724, clicks: 18724, conversions: 1030, reach: 0, frequency: 0, actionTag: 'watch' as const, trend: 4.1,
      adSets: [
        {
          id: 'as9', campaignId: 'cp6', name: 'All Products — Feed', audience: 'Full product catalog feed — India', status: 'active', budget: 30000, spend: 409920, purchaseValue: 1762066, roas: 4.30, ctr: 1.82, cpa: 398, cpc: 21.9, cpm: 0, impressions: 18724, clicks: 18724, conversions: 1030, reach: 0, frequency: 0, actionTag: 'watch' as const, trend: 4.1,
          ads: [
            { id: 'ad11', adSetId: 'as9', name: 'PMax Shopping Asset Group', format: 'image' as const, status: 'active', thumbnailUrl: 'https://picsum.photos/seed/velora-g2/300/300', spend: 409920, purchaseValue: 1762066, roas: 4.30, ctr: 1.82, cpa: 398, cpc: 21.9, cpm: 0, impressions: 18724, clicks: 18724, conversions: 1030, reach: 0, frequency: 0, actionTag: 'watch' as const, trend: 4.1 },
          ],
        },
      ],
    },
  ],
  c2: [],
  c3: [],
}

export function getCampaigns(clientId: string, platform: string, market: string) {
  const all = ALL_CAMPAIGNS[clientId as keyof typeof ALL_CAMPAIGNS] ?? ALL_CAMPAIGNS['c1']
  return all.filter((c) => {
    const platOk = !platform || platform === 'all' || c.platform === platform
    const mktOk = !market || market === 'all' || c.market === market
    return platOk && mktOk
  })
}

// ─── Creatives ───────────────────────────────────────────────────────────────

export function getCreatives(clientId: string) {
  const seeds = ['velora-v1', 'velora-rtg1', 'velora-r1', 'velora-c1', 'velora-v2', 'velora-intl1', 'velora-rtg2', 'velora-c2']
  const formats = ['video', 'carousel', 'reel', 'carousel', 'video', 'reel', 'image', 'carousel'] as const
  const names = ['Summer Collection Hero', 'Dynamic Product Carousel', 'New Arrivals Reel', 'Category Showcase', 'Brand Story — 30s', 'Festive Lookbook', 'Urgency — Limited Stock', 'Ethnic Range Multi']
  const spends = [368000, 128400, 198000, 244000, 298000, 182340, 86380, 189200]
  const roasVals = [5.40, 7.20, 4.70, 4.39, 4.60, 4.00, 5.95, 3.84]
  const ctrVals = [2.8, 3.92, 2.1, 1.7, 1.88, 1.42, 2.88, 1.12]
  const cpaVals = [312, 248, 408, 420, 442, 562, 337, 602]
  const freqVals = [1.28, 2.99, 1.11, 1.68, 1.16, 1.15, 1.76, 3.82]
  const trends = [18.6, 28.4, 8.9, 4.2, 7.2, -1.8, 14.8, -4.6]

  return seeds.map((seed, i) => ({
    id: `cr_${clientId}_${i}`,
    clientId,
    platform: 'meta',
    name: names[i],
    format: formats[i],
    thumbnailUrl: `https://picsum.photos/seed/${seed}/300/400`,
    spend: spends[i],
    purchaseValue: Math.round(spends[i] * roasVals[i]),
    roas: roasVals[i],
    ctr: ctrVals[i],
    cpa: cpaVals[i],
    impressions: Math.round(spends[i] / 18) * 100,
    reach: Math.round(spends[i] / 22) * 100,
    frequency: freqVals[i],
    trend: trends[i],
    isTopPerformer: i < 3,
    fatigueRisk: freqVals[i] > 2.5,
  }))
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export function getAlerts(clientId: string) {
  const now = new Date()
  const ago = (h: number) => new Date(now.getTime() - h * 3600000).toISOString()
  return [
    { id: 'al1', clientId, platform: 'meta', type: 'creative_fatigue', severity: 'warning', campaignId: 'cp2', campaignName: 'Lookalike 1–3% — Purchase (India)', adSetId: 'as4', title: 'Creative Fatigue Detected', message: '"Category Showcase — Carousel" has reached frequency 3.8 in 7 days. CTR fell 24% WoW. Refresh creative to prevent ROAS erosion.', metric: 'frequency', metricValue: 3.8, threshold: 3.5, createdAt: ago(2), isRead: false, actionRequired: true },
    { id: 'al2', clientId, platform: 'meta', type: 'high_performer', severity: 'info', campaignId: 'cp3', campaignName: 'Retargeting — 30D Visitors (India)', title: 'High Performer — Scale Opportunity', message: 'Retargeting campaign delivering 7.2x ROAS, 51% above account target. Audience may saturate in 5–7 days. Consider expanding window from 30 to 45 days.', metric: 'roas', metricValue: 7.2, threshold: 4.8, createdAt: ago(4), isRead: false, actionRequired: false },
    { id: 'al3', clientId, platform: 'meta', type: 'roas_drop', severity: 'critical', campaignId: 'cp4', campaignName: 'LAL 3–6% — UAE & Gulf', title: 'ROAS Below Target', message: 'Gulf campaign ROAS dropped to 4.0x, 16% below the 4.8x target. CPA increased ₹92 over 3 days. Spending ₹6,100/day. Recommend pausing until creative refresh.', metric: 'roas', metricValue: 4.0, threshold: 4.8, createdAt: ago(1), isRead: false, actionRequired: true },
    { id: 'al4', clientId, platform: 'google', type: 'budget_cap', severity: 'warning', campaignId: 'cp6', campaignName: 'Shopping — PMax India', title: 'Budget Capping Mid-Day', message: 'Shopping campaign exhausted ₹30,000 daily budget by 2:30 PM. Impression share lost to budget: 34%. ROAS is 4.3x — above target. Recommend increasing budget by ₹8,000/day.', createdAt: ago(6), isRead: true, actionRequired: true },
    { id: 'al5', clientId, platform: 'meta', type: 'learning_phase', severity: 'info', campaignId: 'cp1', campaignName: 'Advantage+ Shopping — India', title: 'Learning Phase Complete', message: 'Advantage+ campaign exited learning phase after 7 days with 52 optimization events. Performance is now stable. Avoid major changes for 3 days.', createdAt: ago(12), isRead: true, actionRequired: false },
  ]
}
