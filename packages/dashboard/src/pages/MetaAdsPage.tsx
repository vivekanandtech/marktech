import { useState } from 'react'
import { Eye, MousePointer, DollarSign, TrendingUp, Layers, Loader2, AlertTriangle, Link2 } from 'lucide-react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { MetricCard } from '@/components/ui/MetricCard'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useMetaCampaigns } from '@/hooks/useMetaData'
import { getSummaryMetrics, getCampaigns } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'

type CampaignFilter = 'all' | 'active' | 'paused' | 'archived'

const CAMPAIGN_FILTERS: { value: CampaignFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
]

const PAGE_SIZE = 20

// ─── Transform Meta API data → CampaignTable / AdSetRow / AdRow shapes ───────
const safeFloat = (v: any) => { const n = parseFloat(v ?? '0'); return isFinite(n) ? n : 0 }
const safeInt   = (v: any) => { const n = parseInt(v ?? '0', 10); return isFinite(n) ? n : 0 }

const PURCHASE_ACTION_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']

function getConversions(ins: any): number {
  const actions = Array.isArray(ins?.actions) ? ins.actions : []
  return actions
    .filter((a: any) => PURCHASE_ACTION_TYPES.includes(a.action_type))
    .reduce((sum: number, a: any) => sum + safeInt(a.value), 0)
}

// Total revenue attributed to purchase-type conversions — used as a fallback
// for ROAS when Meta doesn't return `purchase_roas` (e.g. accounts where the
// pixel/CAPI reports value but Meta hasn't computed a ROAS rollup yet).
function getConversionValue(ins: any): number {
  const values = Array.isArray(ins?.action_values) ? ins.action_values : []
  return values
    .filter((a: any) => PURCHASE_ACTION_TYPES.includes(a.action_type))
    .reduce((sum: number, a: any) => sum + safeFloat(a.value), 0)
}

function transformInsightMetrics(ins: any) {
  const spend       = safeFloat(ins?.spend)
  const impressions = safeInt(ins?.impressions)
  const clicks      = safeInt(ins?.clicks)
  const reach       = safeInt(ins?.reach)
  const frequency   = safeFloat(ins?.frequency)
  const ctr         = safeFloat(ins?.ctr)
  const cpm         = safeFloat(ins?.cpm)
  const conversions = getConversions(ins)
  const cpa         = conversions > 0 ? spend / conversions : 0
  const cpc         = clicks > 0 ? spend / clicks : 0

  const roasArr = Array.isArray(ins?.purchase_roas) ? ins.purchase_roas : []
  const roas = roasArr.length
    ? safeFloat(roasArr[0]?.value)
    : spend > 0 ? getConversionValue(ins) / spend : 0

  return { spend, impressions, clicks, reach, frequency, roas, ctr, cpm, cpa, cpc, conversions }
}

// Best-effort human-readable summary of an ad set's targeting
function summarizeTargeting(targeting: any): string {
  if (!targeting) return ''
  const parts: string[] = []
  const countries = targeting.geo_locations?.countries
  if (Array.isArray(countries) && countries.length) parts.push(countries.join(', '))
  if (targeting.age_min || targeting.age_max) parts.push(`Age ${targeting.age_min ?? 13}-${targeting.age_max ?? 65}`)
  const genderMap: Record<number, string> = { 1: 'Men', 2: 'Women' }
  if (Array.isArray(targeting.genders) && targeting.genders.length === 1) {
    const g = genderMap[targeting.genders[0]]
    if (g) parts.push(g)
  }
  return parts.join(' · ')
}

function transformMetaAd(a: any) {
  try {
    const creative = a.creative ?? {}
    const format = creative.video_id ? 'video' : creative.object_type === 'SHARE' ? 'carousel' : 'image'
    return {
      id: a.id ?? Math.random().toString(),
      name: a.name ?? 'Unnamed ad',
      format,
      status: (a.effective_status ?? a.status ?? 'unknown').toLowerCase(),
      thumbnailUrl: creative.thumbnail_url ?? creative.image_url ?? '',
      ...transformInsightMetrics(a.insights),
      trend: 0,
    }
  } catch {
    return null
  }
}

function transformMetaAdSet(as: any) {
  try {
    const ads = (Array.isArray(as.ads) ? as.ads : [])
      .map(transformMetaAd)
      .filter((a: any): a is NonNullable<ReturnType<typeof transformMetaAd>> => a !== null)
    return {
      id: as.id ?? Math.random().toString(),
      name: as.name ?? 'Unnamed ad set',
      audience: summarizeTargeting(as.targeting),
      status: (as.effective_status ?? as.status ?? 'unknown').toLowerCase(),
      ...transformInsightMetrics(as.insights),
      trend: 0,
      ads,
    }
  } catch {
    return null
  }
}

function transformMetaCampaign(c: any) {
  try {
    // Meta returns budgets in the currency's minor unit (paise for INR)
    const dailyBudget = safeFloat(c.daily_budget ?? c.lifetime_budget) / 100
    const adSets = (Array.isArray(c.adsets) ? c.adsets : [])
      .map(transformMetaAdSet)
      .filter((a: any): a is NonNullable<ReturnType<typeof transformMetaAdSet>> => a !== null)

    return {
      id: c.id ?? Math.random().toString(),
      name: c.name ?? 'Unnamed campaign',
      platform: 'meta' as const,
      status: (c.effective_status ?? c.status ?? 'unknown').toLowerCase(),
      type: 'prospecting' as const,
      dailyBudget,
      ...transformInsightMetrics(c.insights),
      trend: 0,
      adSets,
    }
  } catch {
    return null
  }
}

// ─── Connected view ───────────────────────────────────────────────────────────
function ConnectedView() {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const activeAccount = currentClient?.meta.adAccounts.find((a) => a.id === currentClient?.metaAdAccountId)
  const [typeFilter, setTypeFilter] = useState<CampaignFilter>('all')
  const [page, setPage] = useState(0)
  const { data: rawCampaigns, loading, error } = useMetaCampaigns()

  const allCampaigns = rawCampaigns
    .map(transformMetaCampaign)
    .filter((c): c is NonNullable<ReturnType<typeof transformMetaCampaign>> => c !== null)

  const filtered = allCampaigns.filter((c) => typeFilter === 'all' || c.status === typeFilter)
  const paginated = filtered.slice(0, (page + 1) * PAGE_SIZE)
  const hasMore = paginated.length < filtered.length

  const totalSpend = allCampaigns.reduce((s, c) => s + c.spend, 0)
  const totalReach = allCampaigns.reduce((s, c) => s + c.reach, 0)
  const avgRoas = allCampaigns.length ? allCampaigns.reduce((s, c) => s + c.roas, 0) / allCampaigns.length : 0
  const avgCtr  = allCampaigns.length ? allCampaigns.reduce((s, c) => s + c.ctr,  0) / allCampaigns.length : 0
  const avgCpa  = allCampaigns.length ? allCampaigns.reduce((s, c) => s + c.cpa,  0) / allCampaigns.length : 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <span className="text-blue-500 dark:text-blue-400 text-sm font-bold">M</span>
          </div>
          <div>
            <h1 className="text-xl font-bold t1">Meta Ads</h1>
            <p className="text-sm t3">Live data · Facebook & Instagram</p>
          </div>
        </div>

        {/* Active ad account — changed from Settings */}
        {activeAccount && (
          <span className="text-xs font-medium bg-surface-2 border border-theme px-2.5 py-1.5 rounded-lg t2">
            {activeAccount.name}
          </span>
        )}
      </div>

      {/* Metrics */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm t3 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading live data from Meta…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          <AlertTriangle size={15} />
          Failed to load Meta data: {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricCard label="Meta Spend" value={formatCurrency(totalSpend)} change={0} improving icon={<DollarSign size={15} />} />
            <MetricCard label="Avg ROAS" value={formatRoas(avgRoas)} change={0} improving icon={<TrendingUp size={15} />} highlight />
            <MetricCard label="Reach" value={formatNumber(totalReach)} change={0} improving icon={<Eye size={15} />} />
            <MetricCard label="Avg CTR" value={formatPercent(avgCtr)} change={0} improving icon={<MousePointer size={15} />} />
            <MetricCard label="Avg CPA" value={formatCurrency(avgCpa)} change={0} improving icon={<Layers size={15} />} />
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold t1">Campaigns <span className="text-xs font-normal t3 ml-1">({filtered.length} total)</span></h3>
                <p className="text-xs t3 mt-0.5">Live · Showing {paginated.length} of {filtered.length}</p>
              </div>
              <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5 border border-theme">
                {CAMPAIGN_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setTypeFilter(f.value)}
                    className={clsx(
                      'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                      typeFilter === f.value ? 'bg-blue-600 text-white shadow-sm' : 't2 hover:t1'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <ErrorBoundary label="Error rendering campaigns">
              <CampaignTable campaigns={paginated} emptyMessage="No campaigns match this filter" />
            </ErrorBoundary>
            {hasMore && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="mt-4 w-full text-xs font-medium t2 hover:t1 border border-dashed border-theme rounded-lg py-2.5 transition-colors"
              >
                Load more ({filtered.length - paginated.length} remaining)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Not connected — mock data view ──────────────────────────────────────────
function MockView() {
  const { clientId, market } = useFilterStore()
  const [typeFilter, setTypeFilter] = useState<CampaignFilter>('all')

  const metrics = getSummaryMetrics(clientId, market)
  const allMetaCampaigns = getCampaigns(clientId, 'meta', market)
  const campaigns = typeFilter === 'all'
    ? allMetaCampaigns
    : allMetaCampaigns.filter((c) => c.status === typeFilter)

  const totalSpend = allMetaCampaigns.reduce((s, c) => s + c.spend, 0)
  const totalReach = allMetaCampaigns.reduce((s, c) => s + c.reach, 0)
  const avgRoas = allMetaCampaigns.length ? allMetaCampaigns.reduce((s, c) => s + c.roas, 0) / allMetaCampaigns.length : 0
  const avgCtr = allMetaCampaigns.length ? allMetaCampaigns.reduce((s, c) => s + c.ctr, 0) / allMetaCampaigns.length : 0
  const avgCpa = allMetaCampaigns.length ? allMetaCampaigns.reduce((s, c) => s + c.cpa, 0) / allMetaCampaigns.length : 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <span className="text-blue-500 dark:text-blue-400 text-sm font-bold">M</span>
          </div>
          <div>
            <h1 className="text-xl font-bold t1">Meta Ads</h1>
            <p className="text-sm t3">Facebook · Instagram · Audience Network</p>
          </div>
        </div>
        <Link
          to="/settings"
          className="flex items-center gap-2 text-xs font-semibold bg-[#1877F2] hover:bg-[#166fe5] text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Link2 size={12} /> Connect Meta Ads
        </Link>
      </div>

      {/* Demo data banner */}
      <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangle size={13} className="shrink-0" />
        Showing demo data. <Link to="/settings" className="underline font-medium">Connect your Meta account</Link> to see live campaigns.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard label="Meta Spend" value={formatCurrency(totalSpend)} change={metrics.adSpend.change} improving={metrics.adSpend.improving} icon={<DollarSign size={15} />} />
        <MetricCard label="Avg ROAS" value={formatRoas(avgRoas)} change={metrics.attributedRoas.change} improving={metrics.attributedRoas.improving} icon={<TrendingUp size={15} />} highlight />
        <MetricCard label="Reach" value={formatNumber(totalReach)} change={metrics.reach.change} improving={metrics.reach.improving} icon={<Eye size={15} />} />
        <MetricCard label="Avg CTR" value={formatPercent(avgCtr)} change={metrics.ctr.change} improving={metrics.ctr.improving} icon={<MousePointer size={15} />} />
        <MetricCard label="Avg CPA" value={formatCurrency(avgCpa)} change={metrics.cpa.change} improving={metrics.cpa.improving} icon={<Layers size={15} />} />
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold t1">Campaigns <span className="text-xs font-normal t3 ml-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">demo</span></h3>
            <p className="text-xs t3 mt-0.5">Click any row to expand Ad Sets → Ads</p>
          </div>
          <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5 border border-theme">
            {CAMPAIGN_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={clsx(
                  'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                  typeFilter === f.value ? 'bg-blue-600 text-white shadow-sm' : 't2 hover:t1'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <CampaignTable campaigns={campaigns} emptyMessage="No Meta campaigns match the current filters" />
      </div>
    </div>
  )
}

// ─── Page entry point ─────────────────────────────────────────────────────────
export function MetaAdsPage() {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const connected = clients.find((c) => c.id === clientId)?.meta.connected ?? false
  return (
    <ErrorBoundary label="Meta Ads page encountered an error">
      {connected ? <ConnectedView /> : <MockView />}
    </ErrorBoundary>
  )
}
