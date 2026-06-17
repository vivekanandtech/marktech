import { useState } from 'react'
import { Eye, MousePointer, DollarSign, TrendingUp, Layers, Loader2, AlertTriangle, Link2 } from 'lucide-react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { MetricCard } from '@/components/ui/MetricCard'
import { CampaignTable, SortKey, SortDir } from '@/components/campaigns/CampaignTable'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useMetaCampaigns } from '@/hooks/useMetaData'
import { getSummaryMetrics, getCampaigns } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { transformInsightMetrics, transformMetaCampaign } from '@/lib/meta-transform'

type CampaignFilter = 'all' | 'active' | 'paused' | 'archived'

const CAMPAIGN_FILTERS: { value: CampaignFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
]

const PAGE_SIZE = 20

// ─── Connected view ───────────────────────────────────────────────────────────
function ConnectedView() {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const activeAccount = currentClient?.meta.adAccounts.find((a) => a.id === currentClient?.metaAdAccountId)
  const [typeFilter, setTypeFilter] = useState<CampaignFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('spend')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const { data: rawCampaigns, accountInsights, loading, error } = useMetaCampaigns()

  const allCampaigns = rawCampaigns
    .map(transformMetaCampaign)
    .filter((c): c is NonNullable<ReturnType<typeof transformMetaCampaign>> => c !== null)

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(0)
  }

  const sorted = [...allCampaigns].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1
    return mul * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0))
  })
  const filtered = sorted.filter((c) => typeFilter === 'all' || c.status === typeFilter)
  const paginated = filtered.slice(0, (page + 1) * PAGE_SIZE)
  const hasMore = paginated.length < filtered.length

  // Use account-level insights for KPI cards — these are the exact totals Meta
  // shows, independent of pagination. Fall back to aggregating campaign rows
  // only if the account-level query returned nothing.
  const acct = accountInsights ? transformInsightMetrics(accountInsights) : null
  const totalSpend = acct?.spend ?? allCampaigns.reduce((s, c) => s + c.spend, 0)
  const totalReach = acct?.reach ?? allCampaigns.reduce((s, c) => s + c.reach, 0)
  const avgRoas    = acct?.roas  ?? 0
  const avgCtr     = acct?.ctr   ?? 0
  const avgCpa     = acct?.cpa   ?? 0

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

      {/* Metrics — keep stale data visible while refetching (dateRange change) */}
      {loading && rawCampaigns.length === 0 ? (
        <div className="flex items-center gap-2 text-sm t3 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading live data from Meta…
        </div>
      ) : error && rawCampaigns.length === 0 ? (
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
                <h3 className="text-sm font-semibold t1">
                  Campaigns <span className="text-xs font-normal t3 ml-1">({filtered.length} total)</span>
                  {loading && <span className="ml-2 text-xs text-blue-500 animate-pulse">Refreshing…</span>}
                </h3>
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
              <CampaignTable
                campaigns={paginated}
                emptyMessage="No campaigns match this filter"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
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
