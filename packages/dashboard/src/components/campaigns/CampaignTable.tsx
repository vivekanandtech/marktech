import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Columns3 } from 'lucide-react'
import clsx from 'clsx'
import { CampaignRow } from './CampaignRow'

export type SortKey = 'spend' | 'roas' | 'ctr' | 'cpa' | 'impressions' | 'clicks'
export type SortDir = 'asc' | 'desc'

interface Campaign {
  id: string
  [key: string]: any
}

interface CampaignTableProps {
  campaigns: Campaign[]
  emptyMessage?: string
  sortKey?: SortKey
  sortDir?: SortDir
  onSort?: (key: SortKey) => void
  adAccountId?: string | null
  // Opt-in — the dedicated Meta/Google Performance pages stay exactly as they
  // were; only Overview's Top Campaigns table enables this.
  enableFunnelToggle?: boolean
}

interface ColumnDef { label: string; key?: SortKey; className: string }

const BASE_COLUMNS: ColumnDef[] = [
  { label: 'Campaign / Ad Set / Ad', className: 'text-left pl-4' },
  { label: 'Spend',       key: 'spend',       className: 'text-right' },
  { label: 'ROAS',        key: 'roas',        className: 'text-right' },
  { label: 'CTR',         key: 'ctr',         className: 'text-right' },
  { label: 'CPA',         key: 'cpa',         className: 'text-right' },
]

// Meta-only funnel stages, sitting unused in data already fetched at every
// level (see lib/meta-actions.ts) — hidden by default since a 5-column table
// is already dense; Google rows show "–" here (Google Ads doesn't report the
// same cart/checkout/payment-info breakdown Meta does).
const FUNNEL_COLUMNS: ColumnDef[] = [
  { label: 'Add to Cart',        className: 'text-right' },
  { label: 'Checkout Initiated', className: 'text-right' },
  { label: 'Payment Info Added', className: 'text-right' },
]

export function CampaignTable({
  campaigns,
  emptyMessage = 'No campaigns found',
  sortKey,
  sortDir,
  onSort,
  adAccountId,
  enableFunnelToggle = false,
}: CampaignTableProps) {
  const [showFunnel, setShowFunnel] = useState(false)

  if (campaigns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 t3 text-sm">
        {emptyMessage}
      </div>
    )
  }

  const columns = showFunnel ? [...BASE_COLUMNS, ...FUNNEL_COLUMNS] : BASE_COLUMNS

  return (
    <div>
      {enableFunnelToggle && (
        <div className="flex justify-end pb-2">
          <button
            onClick={() => setShowFunnel((v) => !v)}
            className={clsx(
              'flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-colors',
              showFunnel
                ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-500 dark:text-indigo-400'
                : 'border-theme t3 hover:t1 hover:bg-surface-2'
            )}
          >
            <Columns3 size={12} /> {showFunnel ? 'Hide funnel metrics' : 'Show funnel metrics'}
          </button>
        </div>
      )}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[740px]">
        <thead>
          <tr className="border-b border-theme">
            {columns.map((col) => {
              const active = col.key && col.key === sortKey
              const canSort = col.key && onSort
              return (
                <th
                  key={col.label}
                  className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider t3 ${col.className} ${canSort ? 'cursor-pointer select-none hover:t1 transition-colors' : ''}`}
                  onClick={() => canSort && onSort(col.key!)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {canSort && (
                      active
                        ? sortDir === 'desc'
                          ? <ChevronDown size={11} className="text-indigo-500 dark:text-indigo-400" />
                          : <ChevronUp size={11} className="text-indigo-500 dark:text-indigo-400" />
                        : <ChevronsUpDown size={11} className="opacity-30" />
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign as any} adAccountId={adAccountId} showFunnel={showFunnel} />
          ))}
        </tbody>
      </table>
    </div>
    </div>
  )
}
