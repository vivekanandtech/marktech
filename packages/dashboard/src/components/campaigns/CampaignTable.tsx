import { CampaignRow } from './CampaignRow'

interface Campaign {
  id: string
  [key: string]: any
}

interface CampaignTableProps {
  campaigns: Campaign[]
  emptyMessage?: string
}

const COLUMNS = [
  { label: 'Campaign / Ad Set / Ad', className: 'text-left pl-4' },
  { label: 'Spend',  className: 'text-right' },
  { label: 'ROAS',   className: 'text-right' },
  { label: 'CTR',    className: 'text-right' },
  { label: 'CPA',    className: 'text-right' },
  { label: 'Trend',  className: 'text-right' },
]

export function CampaignTable({ campaigns, emptyMessage = 'No campaigns found' }: CampaignTableProps) {
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
            {COLUMNS.map((col) => (
              <th
                key={col.label}
                className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider t3 ${col.className}`}
              >
                {col.label}
              </th>
            ))}
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
