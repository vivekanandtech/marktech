import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
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
}

const COLUMNS: { label: string; key?: SortKey; className: string }[] = [
  { label: 'Campaign / Ad Set / Ad', className: 'text-left pl-4' },
  { label: 'Spend',       key: 'spend',       className: 'text-right' },
  { label: 'ROAS',        key: 'roas',        className: 'text-right' },
  { label: 'CTR',         key: 'ctr',         className: 'text-right' },
  { label: 'CPA',         key: 'cpa',         className: 'text-right' },
  { label: 'Trend',                           className: 'text-right' },
]

export function CampaignTable({
  campaigns,
  emptyMessage = 'No campaigns found',
  sortKey,
  sortDir,
  onSort,
}: CampaignTableProps) {
  if (campaigns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 t3 text-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[740px]">
        <thead>
          <tr className="border-b border-theme">
            {COLUMNS.map((col) => {
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
            <CampaignRow key={campaign.id} campaign={campaign as any} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
