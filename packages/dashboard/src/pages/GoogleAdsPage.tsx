import { useState } from 'react'
import { DollarSign, TrendingUp, MousePointer, Target, Layers, Loader2, AlertTriangle, Link2, ChevronDown, ChevronRight, RefreshCw, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { MetricCard } from '@/components/ui/MetricCard'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useGoogleCampaigns, useGoogleAdGroups, GoogleCampaignRaw, GoogleAccountInsightsRaw } from '@/hooks/useGoogleData'
import { getSummaryMetrics, getCampaigns } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'

// ─── Transforms ──────────────────────────────────────────────────────────────

const MICROS = 1_000_000

function microsToCurrency(micros: string | number): number {
  return Number(micros ?? 0) / MICROS
}

function calcRoas(conversionsValue: number, costMicros: string | number): number {
  const spend = microsToCurrency(costMicros)
  return spend > 0 ? conversionsValue / spend : 0
}

function calcCpa(conversions: number, costMicros: string | number): number {
  const spend = microsToCurrency(costMicros)
  return conversions > 0 ? spend / conversions : 0
}

function channelLabel(type: string): string {
  const map: Record<string, string> = {
    SEARCH: 'Search', DISPLAY: 'Display', SHOPPING: 'Shopping',
    PERFORMANCE_MAX: 'PMax', VIDEO: 'Video', MULTI_CHANNEL: 'App',
    DISCOVERY: 'Discovery', DEMAND_GEN: 'Demand Gen', SMART: 'Smart',
  }
  return map[type] ?? type
}

function statusLabel(status: string): string {
  return status === 'ENABLED' ? 'active' : status === 'PAUSED' ? 'paused' : 'archived'
}

// ─── Ad Group row ─────────────────────────────────────────────────────────────

function AdGroupRow({ ag }: { ag: any }) {
  const [open, setOpen] = useState(false)
  const spend  = microsToCurrency(ag.metrics?.costMicros ?? 0)
  const roas   = calcRoas(ag.metrics?.conversionsValue ?? 0, ag.metrics?.costMicros ?? 0)
  const ctr    = (ag.metrics?.ctr ?? 0) * 100
  const cpc    = microsToCurrency(ag.metrics?.averageCpc ?? 0)
  const convs  = ag.metrics?.conversions ?? 0
  const ads    = ag.ads ?? []
  const status = (ag.adGroup?.status ?? '').toLowerCase()

  return (
    <>
      <tr
        className="hover:bg-surface-2 transition-colors cursor-pointer border-t border-theme"
        onClick={() => ads.length > 0 && setOpen((o) => !o)}
      >
        <td className="px-3 py-2 pl-10">
          <div className="flex items-center gap-1.5">
            {ads.length > 0
              ? open ? <ChevronDown size={11} className="t3 shrink-0" /> : <ChevronRight size={11} className="t3 shrink-0" />
              : <span className="w-3" />}
            <span className="text-xs t1 font-medium truncate max-w-[200px]">{ag.adGroup?.name ?? '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 pl-4">
            <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', status === 'enabled' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-surface-3 t3')}>
              {status}
            </span>
            {ads.length > 0 && <span className="text-[10px] t3">{ads.length} ad{ads.length !== 1 ? 's' : ''}</span>}
          </div>
        </td>
        <td className="px-3 py-2 text-xs t1 text-right">{formatCurrency(spend)}</td>
        <td className="px-3 py-2 text-xs t1 text-right">{roas > 0 ? formatRoas(roas) : '—'}</td>
        <td className="px-3 py-2 text-xs t1 text-right">{formatPercent(ctr / 100)}</td>
        <td className="px-3 py-2 text-xs t1 text-right">{formatCurrency(cpc)}</td>
        <td className="px-3 py-2 text-xs t1 text-right">{convs > 0 ? convs.toFixed(1) : '—'}</td>
      </tr>
      {open && ads.map((ad: any) => (
        <tr key={ad.adGroupAd?.ad?.id ?? ad.adGroupAd?.ad?.name} className="bg-surface-2/50">
          <td className="px-3 py-2 pl-16">
            <p className="text-[11px] t1 truncate max-w-[200px]">{ad.adGroupAd?.ad?.name ?? ad.adGroupAd?.ad?.type ?? 'Ad'}</p>
            <p className="text-[10px] t3">{(ad.adGroupAd?.status ?? '').toLowerCase()}</p>
          </td>
          <td className="px-3 py-2 text-[11px] t2 text-right">{formatCurrency(microsToCurrency(ad.metrics?.costMicros ?? 0))}</td>
          <td className="px-3 py-2 text-[11px] t2 text-right">
            {calcRoas(ad.metrics?.conversionsValue ?? 0, ad.metrics?.costMicros ?? 0) > 0
              ? formatRoas(calcRoas(ad.metrics?.conversionsValue ?? 0, ad.metrics?.costMicros ?? 0))
              : '—'}
          </td>
          <td className="px-3 py-2 text-[11px] t2 text-right">{formatPercent((ad.metrics?.ctr ?? 0))}</td>
          <td className="px-3 py-2 text-[11px] t2 text-right">{formatCurrency(microsToCurrency(ad.metrics?.averageCpc ?? 0))}</td>
          <td className="px-3 py-2 text-[11px] t2 text-right">{(ad.metrics?.conversions ?? 0) > 0 ? Number(ad.metrics.conversions).toFixed(1) : '—'}</td>
        </tr>
      ))}
    </>
  )
}

// ─── Campaign row ─────────────────────────────────────────────────────────────

function CampaignRow({ campaign }: { campaign: GoogleCampaignRaw }) {
  const [open, setOpen] = useState(false)
  const { adGroups, loading } = useGoogleAdGroups(open ? campaign.campaign.id : null)

  const spend   = microsToCurrency(campaign.metrics.costMicros)
  const roas    = calcRoas(campaign.metrics.conversionsValue, campaign.metrics.costMicros)
  const ctr     = campaign.metrics.ctr * 100
  const cpc     = microsToCurrency(campaign.metrics.averageCpc)
  const convs   = campaign.metrics.conversions
  const cpa     = calcCpa(convs, campaign.metrics.costMicros)
  const status  = statusLabel(campaign.campaign.status)
  const channel = channelLabel(campaign.campaign.advertisingChannelType)

  return (
    <>
      <tr
        className="hover:bg-surface-2 transition-colors cursor-pointer border-t border-theme"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown size={12} className="t3 shrink-0" /> : <ChevronRight size={12} className="t3 shrink-0" />}
            <div>
              <p className="text-xs font-medium t1 truncate max-w-[220px]">{campaign.campaign.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', status === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-surface-3 t3')}>
                  {status}
                </span>
                <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium">{channel}</span>
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs t1 text-right font-medium">{formatCurrency(spend)}</td>
        <td className="px-3 py-2.5 text-xs text-right">
          <span className={clsx('font-semibold', roas >= 3 ? 'text-emerald-500' : roas >= 1.5 ? 'text-amber-500' : roas > 0 ? 'text-red-500' : 't3')}>
            {roas > 0 ? formatRoas(roas) : '—'}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs t1 text-right">{formatPercent(ctr / 100)}</td>
        <td className="px-3 py-2.5 text-xs t1 text-right">{formatCurrency(cpc)}</td>
        <td className="px-3 py-2.5 text-xs t1 text-right">
          {convs > 0 ? (
            <div>
              <p>{convs.toFixed(1)}</p>
              {cpa > 0 && <p className="text-[10px] t3">₹{cpa.toFixed(0)} CPA</p>}
            </div>
          ) : '—'}
        </td>
      </tr>
      {open && (
        loading
          ? <tr><td colSpan={6} className="px-10 py-3 text-xs t3 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading ad groups…</td></tr>
          : adGroups.length === 0
            ? <tr><td colSpan={6} className="px-10 py-3 text-xs t3">No ad groups found.</td></tr>
            : adGroups.map((ag: any) => <AdGroupRow key={ag.adGroup?.id} ag={ag} />)
      )}
    </>
  )
}

// ─── Campaign table header ────────────────────────────────────────────────────

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={clsx('px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide t3 bg-surface-2 whitespace-nowrap', right ? 'text-right' : 'text-left')}>
    {children}
  </th>
)

// ─── Connected view ───────────────────────────────────────────────────────────

function ConnectedView() {
  const { clientId, dateRange } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const google = currentClient?.google
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')

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
            <MetricCard label="Google Spend" value={formatCurrency(totalSpend)} change={0} improving icon={<DollarSign size={15} />} />
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
                <p className="text-xs t3 mt-0.5">Click to expand Ad Groups → Ads</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status filter */}
                <div className="flex items-center gap-0.5 bg-surface-2 rounded-lg p-0.5 border border-theme">
                  {(['all', 'active', 'paused'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
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
                        onClick={() => setChannelFilter(ch)}
                        className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                          channelFilter === ch ? 'bg-blue-600 text-white shadow-sm' : 't2 hover:t1'
                        )}
                      >{ch === 'all' ? 'All types' : ch}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <TH>Campaign</TH>
                    <TH right>Spend</TH>
                    <TH right>ROAS</TH>
                    <TH right>CTR</TH>
                    <TH right>CPC</TH>
                    <TH right>Conversions</TH>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-sm t3">
                        No campaigns match this filter.
                      </td>
                    </tr>
                  ) : filtered.map((c) => (
                    <CampaignRow key={c.campaign.id} campaign={c} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Not connected — mock data view ──────────────────────────────────────────

function MockView() {
  const { clientId, market } = useFilterStore()
  const metrics = getSummaryMetrics(clientId, market)
  const campaigns = getCampaigns(clientId, 'google', market)

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
        <MetricCard label="Google Spend" value={formatCurrency(totalSpend)} change={metrics.adSpend.change * 0.8} improving icon={<DollarSign size={15} />} />
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
