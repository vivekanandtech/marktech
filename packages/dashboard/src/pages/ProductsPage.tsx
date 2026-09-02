import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, Loader2, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, Search, Eye, ShoppingCart, CreditCard } from 'lucide-react'
import clsx from 'clsx'
import { useProductPerformance, ProductRow } from '@/hooks/useProductPerformance'
import { MetricCard } from '@/components/ui/MetricCard'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { Pagination } from '@/components/ui/Pagination'
import { formatCurrency, formatNumber, formatRoas, formatPercent } from '@/lib/formatters'

type SortKey =
  | 'sessions' | 'addToCart' | 'checkoutsInitiated'
  | 'shopifyRevenue' | 'shopifyOrders' | 'unitsSold'
  | 'googleCost' | 'googleConversions' | 'googleRoas'
type SortDir = 'asc' | 'desc'

// Funnel columns first (sessions → add to cart → checkout → order), mirroring
// the campaign table's mental model — "parallel campaigns as products." These
// are real, unattributed Shopify site traffic (no ad spend implied), joined
// from landing_page_path via the product handle — see getProductSessionFunnel.
const COLUMNS: { label: string; key: SortKey; className: string }[] = [
  { label: 'Sessions',      key: 'sessions',          className: 'text-right' },
  { label: 'Add to Cart',   key: 'addToCart',         className: 'text-right' },
  { label: 'Checkouts',     key: 'checkoutsInitiated',className: 'text-right' },
  { label: 'Revenue',       key: 'shopifyRevenue',    className: 'text-right' },
  { label: 'Orders',        key: 'shopifyOrders',     className: 'text-right' },
  { label: 'Units Sold',    key: 'unitsSold',         className: 'text-right' },
  { label: 'Google Cost',   key: 'googleCost',        className: 'text-right' },
  { label: 'Google Conv.',  key: 'googleConversions', className: 'text-right' },
  { label: 'Google ROAS',   key: 'googleRoas',        className: 'text-right' },
]

const ROWS_PER_PAGE = 25

function NotConnected() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-theme p-12 text-center">
      <Package size={28} className="t3" />
      <h2 className="text-base font-semibold t1">Connect Shopify or Google Ads</h2>
      <p className="text-sm t3 max-w-sm">
        Product performance combines Shopify's real sales data with Google Shopping/Performance Max ad cost — connect at least one to see it here.
      </p>
      <Link to="/settings" className="text-sm text-indigo-500 hover:underline font-medium">
        Go to Settings →
      </Link>
    </div>
  )
}

export function ProductsPage() {
  const { data, loading, error, connected, refresh } = useProductPerformance()
  const [sortKey, setSortKey] = useState<SortKey>('shopifyRevenue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(ROWS_PER_PAGE)

  const products = data?.products ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products
    return [...base].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'desc' ? -diff : diff
    })
  }, [products, search, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const pagedRows = filtered.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize)

  const totals = useMemo(() => products.reduce((acc, p) => ({
    revenue: acc.revenue + p.shopifyRevenue,
    units: acc.units + p.unitsSold,
    googleCost: acc.googleCost + p.googleCost,
    googleConversionsValue: acc.googleConversionsValue + p.googleConversionsValue,
    sessions: acc.sessions + p.sessions,
    addToCart: acc.addToCart + p.addToCart,
    checkoutsInitiated: acc.checkoutsInitiated + p.checkoutsInitiated,
    orders: acc.orders + p.shopifyOrders,
  }), { revenue: 0, units: 0, googleCost: 0, googleConversionsValue: 0, sessions: 0, addToCart: 0, checkoutsInitiated: 0, orders: 0 }), [products])
  const blendedRoas = totals.googleCost > 0 ? totals.googleConversionsValue / totals.googleCost : 0
  const siteConversionRate = totals.sessions > 0 ? (totals.orders / totals.sessions) * 100 : 0

  function onSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
    setPage(0)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold t1 flex items-center gap-2">
            <Package size={20} className="text-indigo-500" />
            Products
          </h1>
          <p className="text-sm t3 mt-0.5">
            Shopify revenue × Google Shopping/PMax cost, per product
            {data && !data.connected.google && ' · Google not connected — ad columns unavailable'}
          </p>
        </div>
        {loading && <Loader2 size={13} className="animate-spin t3" />}
      </div>

      {data && data.connected.google && data.googleMatchedProductCount === 0 && data.products.some((p) => p.hasGoogleData) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-600 dark:text-amber-400">
              Google Cost / Conv. / ROAS look blank because the connected Google Ads account doesn't match this store
            </p>
            <p className="t2 mt-1">
              The Google Ads account linked here is named{' '}
              <strong className="t1">"{data.googleAccountName ?? 'unknown'}"</strong> — none of its advertised products
              matched any product actually sold on this Shopify store in this window. That's the sign of a
              product-catalog mismatch (wrong Google Ads account connected for this client), not missing data — check{' '}
              <Link to="/settings" className="underline font-medium">Settings</Link> and reconnect the correct account.
            </p>
          </div>
        </div>
      )}

      {!connected ? (
        <NotConnected />
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
          <AlertTriangle size={15} /> Failed to load product performance: {error}
        </div>
      ) : loading && !data ? (
        <div className="flex items-center gap-2 text-sm t3 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading product performance…
        </div>
      ) : (
        <>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide t3 mb-2">Site funnel — unattributed, no ad spend implied</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label="Sessions" value={formatNumber(totals.sessions)} change={0} improving icon={<Eye size={15} />} />
              <MetricCard label="Added to Cart" value={formatNumber(totals.addToCart)} change={0} improving icon={<ShoppingCart size={15} />} />
              <MetricCard label="Checkouts Initiated" value={formatNumber(totals.checkoutsInitiated)} change={0} improving icon={<CreditCard size={15} />} />
              <MetricCard
                label="Site Conversion Rate"
                value={totals.sessions > 0 ? formatPercent(siteConversionRate) : '—'}
                subtitle="orders ÷ sessions, all products"
                change={0} improving
              />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide t3 mb-2">Revenue &amp; ad spend</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label="Shopify Revenue" value={formatCurrency(totals.revenue)} change={0} improving icon={<Package size={15} />} />
              <MetricCard label="Units Sold" value={formatNumber(totals.units)} change={0} improving />
              <MetricCard
                label="Google Ad Cost"
                value={data?.connected.google ? formatCurrency(totals.googleCost) : '—'}
                subtitle={!data?.connected.google ? 'Connect Google Ads to see this' : undefined}
                change={0} improving
              />
              <MetricCard
                label="Blended Product ROAS"
                value={data?.connected.google && totals.googleCost > 0 ? formatRoas(blendedRoas) : '—'}
                subtitle={data?.connected.google ? 'Google-reported, not Shopify-verified' : undefined}
                change={0} improving
              />
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold t1">{filtered.length} of {products.length} products</h3>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 t3" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                  placeholder="Search products…"
                  className="text-xs t1 bg-surface-2 border border-theme rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 w-56"
                />
              </div>
            </div>

            {products.length === 0 ? (
              <div className="flex items-center justify-center h-32 t3 text-sm">
                No product sales in this period.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px]">
                    <thead>
                      <tr className="border-b border-theme">
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider t3">Product</th>
                        {COLUMNS.map((col) => {
                          const active = col.key === sortKey
                          return (
                            <th
                              key={col.key}
                              className={clsx('px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider t3 cursor-pointer select-none hover:t1 transition-colors', col.className)}
                              onClick={() => onSort(col.key)}
                            >
                              <span className="inline-flex items-center gap-1">
                                {col.label}
                                {active
                                  ? sortDir === 'desc'
                                    ? <ChevronDown size={11} className="text-indigo-500 dark:text-indigo-400" />
                                    : <ChevronUp size={11} className="text-indigo-500 dark:text-indigo-400" />
                                  : <ChevronsUpDown size={11} className="opacity-30" />}
                              </span>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.map((p) => (
                        <ProductRowView key={p.productId} product={p} deltas={data?.deltas[p.productId]} googleConnected={!!data?.connected.google} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {filtered.length > 0 && (
                  <Pagination
                    page={clampedPage}
                    totalItems={filtered.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ProductRowView({ product, deltas, googleConnected }: { product: ProductRow; deltas?: Record<string, number>; googleConnected: boolean }) {
  const d = (key: string) => deltas?.[key] ?? 0
  return (
    <tr className="border-b border-theme hover:bg-surface-2/70 transition-colors">
      <td className="px-3 py-2.5">
        <p className="text-xs font-medium t1 max-w-[280px] truncate" title={product.title}>{product.title}</p>
        {!product.shopifyRevenue && product.hasGoogleData && (
          <span className="text-[10px] text-amber-500 dark:text-amber-400">Advertised, no sales this period</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right text-xs t2">
        {formatNumber(product.sessions)}
        <div><TrendBadge change={d('sessions')} improving={d('sessions') >= 0} /></div>
      </td>
      <td className="px-3 py-2.5 text-right text-xs t2">
        {formatNumber(product.addToCart)}
        <div><TrendBadge change={d('addToCart')} improving={d('addToCart') >= 0} /></div>
      </td>
      <td className="px-3 py-2.5 text-right text-xs t2">
        {formatNumber(product.checkoutsInitiated)}
        <div><TrendBadge change={d('checkoutsInitiated')} improving={d('checkoutsInitiated') >= 0} /></div>
      </td>
      <td className="px-3 py-2.5 text-right text-xs">
        <p className="font-semibold t1">{formatCurrency(product.shopifyRevenue)}</p>
        <TrendBadge change={d('shopifyRevenue')} improving={d('shopifyRevenue') >= 0} />
      </td>
      <td className="px-3 py-2.5 text-right text-xs t2">
        {formatNumber(product.shopifyOrders)}
        <div><TrendBadge change={d('shopifyOrders')} improving={d('shopifyOrders') >= 0} /></div>
      </td>
      <td className="px-3 py-2.5 text-right text-xs t2">
        {formatNumber(product.unitsSold)}
        <div><TrendBadge change={d('unitsSold')} improving={d('unitsSold') >= 0} /></div>
      </td>
      {googleConnected ? (
        <>
          <td className="px-3 py-2.5 text-right text-xs t2">
            {product.hasGoogleData ? formatCurrency(product.googleCost) : '—'}
            {product.hasGoogleData && <div><TrendBadge change={d('googleCost')} improving={d('googleCost') <= 0} /></div>}
          </td>
          <td className="px-3 py-2.5 text-right text-xs t2">
            {product.hasGoogleData ? formatNumber(product.googleConversions) : '—'}
            {product.hasGoogleData && <div><TrendBadge change={d('googleConversions')} improving={d('googleConversions') >= 0} /></div>}
          </td>
          <td className="px-3 py-2.5 text-right text-xs">
            {product.hasGoogleData && product.googleCost > 0 ? (
              <p className={clsx('font-bold', product.googleRoas >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' : product.googleRoas >= 3.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                {formatRoas(product.googleRoas)}
              </p>
            ) : (
              <span className="t3">—</span>
            )}
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2.5 text-right text-xs t3">—</td>
          <td className="px-3 py-2.5 text-right text-xs t3">—</td>
          <td className="px-3 py-2.5 text-right text-xs t3">—</td>
        </>
      )}
    </tr>
  )
}
