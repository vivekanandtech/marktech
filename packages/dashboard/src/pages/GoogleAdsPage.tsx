import { IndianRupee, TrendingUp, MousePointer, Target, Layers, Loader2, AlertTriangle, Link2, RefreshCw, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MetricCard } from '@/components/ui/MetricCard'
import { Pagination } from '@/components/ui/Pagination'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useGoogleCampaigns, GoogleAccountInsightsRaw } from '@/hooks/useGoogleData'
import { getSummaryMetrics, getCampaigns } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'
import { microsToCurrency, channelLabel, statusLabel, transformGoogleCampaign } from '@/lib/google-transform'

// ─── Connected view ───────────────────────────────────────────────────────────

function ConnectedView() {
  const { clientId, dateRange } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const google = currentClient?.google
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  const { data: campaigns, accountInsights, loading, error, refresh } = useGoogleCampaigns()

  const acct = accountInsights as GoogleAccountInsightsRaw | null
  const totalSpend   = acct ? microsToCurrency(acct.costMicros) : campaigns.reduce((s, c) => s + microsToCurrency(c.metrics.costMicros), 0)
  const totalConvs   = acct?.conversions ?? campaigns.reduce((s, c) => s + c.metrics.conversions, 0)
  const totalConvVal = acct?.conversionsValue ?? campaigns.reduce((s, c) => s + c.metrics.conversionsValue, 0)
  const avgRoas      = totalSpend > 0 ? totalConvVal / totalSpend : 0
  const totalClicks  = acct?.clicks ?? campaigns.reduce((s, c) => s + Number(c.metrics.clicks ?? 0), 0)
  const totalImps    = acct?.impressions ?? campaigns.reduce((s, c) => s + Number(c.metrics.impressions ?? 0), 0)
  const avgCtr       = totalImps > 0 ? totalClicks / totalImps : 0
  const avgCpa       = totalConvs > 0 ? totalSpend / totalConvs : 0

  const channels = ['all', ...Array.from(new Set(campaigns.map((c) => channelLabel(c.campaign.advertisingChannelType))))]

  const filtered = campaigns.filter((c) => {
    const s = statusLabel(c.campaign.status)
    if (statusFilter !== 'all' && s !== statusFilter) return false
    if (channelFilter !== 'all' && channelLabel(c.campaign.advertisingChannelType) !== channelFilter) return false
    return true
  })

  // Shared CampaignTable/CampaignRow/AdSetRow/AdRow expect the same generic
  // shape Meta campaigns use — transform here rather than maintaining a
  // second, parallel table implementation.
  const transformedCampaigns = filtered.map(transformGoogleCampaign)
  const totalPages = Math.max(1, Math.ceil(transformedCampaigns.length / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const paginatedCampaigns = transformedCampaigns.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold">G</span>
          </div>
          <div>
            <h1 className="text-xl font-bold t1">Google Ads</h1>
            <p className="text-sm t3">{google?.customerName ?? google?.customerId ?? 'Live data'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium border border-theme bg-surface-2 hover:bg-surface-3 disabled:opacity-50 t2 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {google?.customerId && (
            <a
              href={`https://ads.google.com/aw/campaigns?__e=${google.customerId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold bg-[#4285F4] hover:bg-[#3367D6] text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink size={12} /> Open Google Ads
            </a>
          )}
        </div>
      </div>

      {/* KPI cards */}
      {loading && campaigns.length === 0 ? (
        <div className="flex items-center gap-2 text-sm t3 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading live data from Google Ads…
        </div>
      ) : error && campaigns.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          <AlertTriangle size={15} /> Failed to load Google Ads data: {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricCard label="Google Spend" value={formatCurrency(totalSpend)} change={0} improving icon={<IndianRupee size={15} />} />
            <MetricCard label="ROAS" value={avgRoas > 0 ? formatRoas(avgRoas) : '—'} change={0} improving icon={<TrendingUp size={15} />} highlight />
            <MetricCard label="Clicks" value={formatNumber(totalClicks)} change={0} improving icon={<MousePointer size={15} />} />
            <MetricCard label="Conversions" value={totalConvs > 0 ? totalConvs.toFixed(1) : '0'} change={0} improving icon={<Target size={15} />} />
            <MetricCard label="Avg CPA" value={avgCpa > 0 ? formatCurrency(avgCpa) : '—'} change={0} improving icon={<Layers size={15} />} />
          </div>

          {/* Campaign table */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-theme flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold t1">
                  Campaigns <span className="text-xs font-normal t3 ml-1">({filtered.length})</span>
                  {loading && <span className="ml-2 text-xs text-emerald-500 animate-pulse">Refreshing…</span>}
                </h3>
                <p className="text-xs t3 mt-0.5">Page {clampedPage + 1} of {totalPages} · click to expand Ad Groups → Ads</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status filter */}
                <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5 border border-theme">
                  {(['all', 'active', 'paused'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => { setStatusFilter(f); setPage(0) }}
                      className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors capitalize',
                        statusFilter === f ? 'bg-emerald-600 text-white shadow-sm' : 't2 hover:t1'
                      )}
                    >{f}</button>
                  ))}
                </div>
                {/* Channel filter */}
                {channels.length > 2 && (
                  <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5 border border-theme">
                    {channels.map((ch) => (
                      <button
                        key={ch}
                        onClick={() => { setChannelFilter(ch); setPage(0) }}
                        className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                          channelFilter === ch ? 'bg-blue-600 text-white shadow-sm' : 't2 hover:t1'
                        )}
                      >{ch === 'all' ? 'All types' : ch}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <CampaignTable campaigns={paginatedCampaigns} emptyMessage="No campaigns match this filter." />
            {transformedCampaigns.length > 0 && (
              <div className="px-4 pb-3">
                <Pagination
                  page={clampedPage}
                  totalItems={transformedCampaigns.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Not connected — mock data view ──────────────────────────────────────────

function MockView() {
  const { clientId, country } = useFilterStore()
  const mockMarket = country === 'all' ? 'all' : country === 'India' ? 'india' : 'international'
  const metrics = getSummaryMetrics(clientId, mockMarket)
  const campaigns = getCampaigns(clientId, 'google', mockMarket)

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  const avgRoas = campaigns.length ? campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length : 0
  const avgCtr = campaigns.length ? campaigns.reduce((s, c) => s + c.ctr, 0) / campaigns.length : 0
  const avgCpa = campaigns.length ? campaigns.reduce((s, c) => s + c.cpa, 0) / campaigns.length : 0
  const avgCpc = campaigns.length ? campaigns.reduce((s, c) => s + c.cpc, 0) / campaigns.length : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold">G</span>
          </div>
          <div>
            <h1 className="text-xl font-bold t1">Google Ads</h1>
            <p className="text-sm t3">Search · Shopping · Performance Max</p>
          </div>
        </div>
        <Link
          to="/settings"
          className="flex items-center gap-2 text-xs font-semibold bg-[#4285F4] hover:bg-[#3367D6] text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Link2 size={12} /> Connect Google Ads
        </Link>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangle size={13} className="shrink-0" />
        Showing demo data. <Link to="/settings" className="underline font-medium">Connect your Google Ads account</Link> to see live campaigns.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard label="Google Spend" value={formatCurrency(totalSpend)} change={metrics.adSpend.change * 0.8} improving icon={<IndianRupee size={15} />} />
        <MetricCard label="ROAS" value={formatRoas(avgRoas)} change={metrics.attributedRoas.change} improving={metrics.attributedRoas.improving} icon={<TrendingUp size={15} />} highlight />
        <MetricCard label="Avg CTR" value={formatPercent(avgCtr)} change={metrics.ctr.change} improving={metrics.ctr.improving} icon={<MousePointer size={15} />} />
        <MetricCard label="Avg CPA" value={formatCurrency(avgCpa)} change={metrics.cpa.change} improving={metrics.cpa.improving} icon={<Target size={15} />} />
        <MetricCard label="Avg CPC" value={formatCurrency(avgCpc)} change={metrics.cpc.change} improving={metrics.cpc.improving} icon={<Layers size={15} />} />
      </div>

      <div className="card p-4">
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
            <span className="text-emerald-500 font-bold text-lg">G</span>
          </div>
          <p className="text-sm font-medium t2">Connect Google Ads to see live data</p>
          <p className="text-xs t3 max-w-xs">Go to Settings to connect your Google Ads account. You'll need a Google Ads developer token and OAuth credentials.</p>
          <Link to="/settings" className="text-xs font-semibold text-blue-500 hover:underline">Go to Settings →</Link>
        </div>
      </div>
    </div>
  )
}

// ─── Page entry point ─────────────────────────────────────────────────────────

export function GoogleAdsPage() {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const connected = clients.find((c) => c.id === clientId)?.google?.connected ?? false
  return connected ? <ConnectedView /> : <MockView />
}
