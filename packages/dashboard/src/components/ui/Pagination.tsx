import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100]

interface PaginationProps {
  page: number                 // 0-indexed current page
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
}

// Shared pager used across every paginated table in the app (Shopify reports,
// Products, Meta/Google campaign lists) so page-size behavior — and the
// 10/25/50/100 dropdown — stays consistent instead of four separate ad-hoc
// implementations.
export function Pagination({
  page, totalItems, pageSize, onPageChange, onPageSizeChange, pageSizeOptions = DEFAULT_PAGE_SIZES,
}: PaginationProps) {
  // A pageSize outside the option list would leave the <select> showing the
  // wrong value (the browser silently falls back to its first option) while
  // the real page size is something else — fold it in rather than mismatch.
  const options = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b)
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const start = totalItems === 0 ? 0 : clampedPage * pageSize + 1
  const end = Math.min((clampedPage + 1) * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 px-1 pt-3">
      <div className="flex items-center gap-2 text-[11px] t3">
        <span>Showing {start}–{end} of {totalItems}</span>
        <div className="relative">
          <select
            value={pageSize}
            onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(0) }}
            className="appearance-none text-[11px] t2 bg-surface-2 border border-theme rounded-md pl-2 pr-6 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
          >
            {options.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 t3 pointer-events-none" />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(0, clampedPage - 1))}
          disabled={clampedPage === 0}
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-theme t2 hover:t1 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft size={13} />
        </button>
        <span className="text-[11px] t2 font-medium px-1.5 min-w-[64px] text-center">
          Page {clampedPage + 1} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, clampedPage + 1))}
          disabled={clampedPage >= totalPages - 1}
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-theme t2 hover:t1 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
