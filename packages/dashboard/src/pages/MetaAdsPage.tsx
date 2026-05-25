import { useState } from 'react'
import { Eye, MousePointer, DollarSign, TrendingUp, Layers, Loader2, AlertTriangle, Link2, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { MetricCard } from '@/components/ui/MetricCard'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { useFilterStore } from '@/store/filterStore'
import { useMetaStore } from '@/store/metaStore'
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

// ─── Transform Meta API campaign → CampaignTable shape ───────────────────────
function transformMetaCampaign(c: any) {
  const ins = c.insights ?? {}
  const spend = parseFloat(ins.spend ?? '0')
  const impressions = parseInt(ins.impressions ?? '0', 10)
  const clicks = parseInt(ins.clicks ?? '0', 10)
  const reach = parseInt(ins.reach ?? '0', 10)
  const roasArr = ins.purchase_roas ?? []
  const roas = roasArr.length ? parseFloat(roasArr[0].value) : 0
  const ctr = parseFloat(ins.ctr ?? '0')
  const cpm = parseFloat(ins.cpm ?? '0')
  const cpa = clicks > 0 ? spend / clicks : 0

  return {
    id: c.id,
    name: c.name,
    platform: 'meta' as const,
    status: c.effective_status?.toLowerCase() ?? c.status?.toLowerCase() ?? 'unknown',
    type: 'prospecting' as const,
    spend,
    roas,
    ctr,
    cpa,
    cpm,
    reach,
    impressions,
    clicks,
    trend: 0,
    adSets: [],
  }
}

// ─── Connected view ───────────────────────────────────────────────────────────
function ConnectedView() {
  const { clientId, market } = useFilterStore()
  const { adAccounts, selectedAdAccountId, selectAdAccount } = useMetaStore()
  const [typeFilter, setTypeFilter] = useState<CampaignFilter>('all')
  const { data: rawCampaigns, loading, error } = useMetaCampaigns()

  const campaigns = rawCampaigns
    .map(transformMetaCampaign)
    .filter((c) => typeFilter === 'all' || c.status === typeFilter)

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  const totalReach = campaigns.reduce((s, c) => s + c.reach, 0)
  const avgRoas = campaigns.length ? campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length : 0
  const avgCtr = campaigns.length ? campaigns.reduce((s, c) => s + c.ctr, 0) / campaigns.length : 0
  const avgCpa = campaigns.length ? campaigns.reduce((s, c) => s + c.cpa, 0) / campaigns.length : 0

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

        {/* Ad account selector */}
        {adAccounts.length > 1 && (
          <div className="relative">
            <select
              value={selectedAdAccountId ?? ''}
              onChange={(e) => selectAdAccount(e.target.value)}
              className="appearance-none text-xs font-medium t1 bg-surface-2 border border-theme rounded-lg pl-3 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {adAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 t3 pointer-events-none" />
          </div>
        )}
        {adAccounts.length === 1 && (
          <span className="text-xs font-medium bg-surface-2 border border-theme px-2.5 py-1.5 rounded-lg t2">
            {adAccounts[0].name}
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
                <h3 className="text-sm font-semibold t1">Campaigns <span className="text-xs font-normal t3 ml-1">({rawCampaigns.length} total)</span></h3>
                <p className="text-xs t3 mt-0.5">Live · Click any row to expand Ad Sets → Ads</p>
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
            <CampaignTable campaigns={campaigns} emptyMessage="No campaigns match this filter" />
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
  const { connected } = useMetaStore()
  return connected ? <ConnectedView /> : <MockView />
}
