import { DollarSign, TrendingUp, MousePointer, Target, Layers } from 'lucide-react'
import { MetricCard } from '@/components/ui/MetricCard'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { useFilterStore } from '@/store/filterStore'
import { getSummaryMetrics, getCampaigns } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent } from '@/lib/formatters'

export function GoogleAdsPage() {
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
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
          <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold">G</span>
        </div>
        <div>
          <h1 className="text-xl font-bold t1">Google Ads</h1>
          <p className="text-sm t3">Search · Shopping · Performance Max</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard label="Google Spend" value={formatCurrency(totalSpend)} change={metrics.adSpend.change * 0.8} improving icon={<DollarSign size={15} />} />
        <MetricCard label="Avg ROAS" value={formatRoas(avgRoas)} change={metrics.attributedRoas.change} improving={metrics.attributedRoas.improving} icon={<TrendingUp size={15} />} highlight />
        <MetricCard label="Avg CTR" value={formatPercent(avgCtr)} change={metrics.ctr.change} improving={metrics.ctr.improving} icon={<MousePointer size={15} />} />
        <MetricCard label="Avg CPA" value={formatCurrency(avgCpa)} change={metrics.cpa.change} improving={metrics.cpa.improving} icon={<Target size={15} />} />
        <MetricCard label="Avg CPC" value={formatCurrency(avgCpc)} change={metrics.cpc.change} improving={metrics.cpc.improving} icon={<Layers size={15} />} />
      </div>

      <div className="card p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold t1">Campaigns</h3>
          <p className="text-xs t3 mt-0.5">Search · Shopping · PMax · Click to expand Ad Groups → Ads</p>
        </div>
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3">
              <Target size={20} className="t3" />
            </div>
            <p className="text-sm font-medium t2">Google Ads data coming soon</p>
            <p className="text-xs t3 mt-1 max-w-xs">Google Ads API developer token is pending approval. Connect your account in Settings once approved.</p>
          </div>
        ) : (
          <CampaignTable campaigns={campaigns} />
        )}
      </div>
    </div>
  )
}
