import { useState } from 'react'
import { Eye, MousePointer, DollarSign, TrendingUp, Layers } from 'lucide-react'
import clsx from 'clsx'
import { MetricCard } from '@/components/ui/MetricCard'
import { CampaignTable } from '@/components/campaigns/CampaignTable'
import { useFilterStore } from '@/store/filterStore'
import { getSummaryMetrics, getCampaigns } from '@/lib/mock-data'
import { formatCurrency, formatRoas, formatPercent, formatNumber } from '@/lib/formatters'

type CampaignFilter = 'all' | 'advantage_plus' | 'lookalike' | 'retargeting' | 'prospecting'

const CAMPAIGN_FILTERS: { value: CampaignFilter; label: string }[] = [
  { value: 'all', label: 'All Campaigns' },
  { value: 'advantage_plus', label: 'Advantage+' },
  { value: 'lookalike', label: 'Lookalike' },
  { value: 'retargeting', label: 'Retargeting' },
  { value: 'prospecting', label: 'Prospecting' },
]

export function MetaAdsPage() {
  const { clientId, market } = useFilterStore()
  const [typeFilter, setTypeFilter] = useState<CampaignFilter>('all')

  const metrics = getSummaryMetrics(clientId, market)
  const allMetaCampaigns = getCampaigns(clientId, 'meta', market)
  const campaigns = typeFilter === 'all'
    ? allMetaCampaigns
    : allMetaCampaigns.filter((c) => c.type === typeFilter)

  const totalSpend = allMetaCampaigns.reduce((s, c) => s + c.spend, 0)
  const totalReach = allMetaCampaigns.reduce((s, c) => s + c.reach, 0)
  const avgRoas = allMetaCampaigns.length ? allMetaCampaigns.reduce((s, c) => s + c.roas, 0) / allMetaCampaigns.length : 0
  const avgCtr = allMetaCampaigns.length ? allMetaCampaigns.reduce((s, c) => s + c.ctr, 0) / allMetaCampaigns.length : 0
  const avgCpa = allMetaCampaigns.length ? allMetaCampaigns.reduce((s, c) => s + c.cpa, 0) / allMetaCampaigns.length : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
          <span className="text-blue-500 dark:text-blue-400 text-sm font-bold">M</span>
        </div>
        <div>
          <h1 className="text-xl font-bold t1">Meta Ads</h1>
          <p className="text-sm t3">Facebook · Instagram · Audience Network</p>
        </div>
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
            <h3 className="text-sm font-semibold t1">Campaigns</h3>
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
