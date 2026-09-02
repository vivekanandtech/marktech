import { useState, useEffect, useCallback, useMemo } from 'react'
import { ShoppingBag, RefreshCw, AlertTriangle, Loader2, TrendingUp, MousePointerClick, Link2, Key, Eye, Users, ShoppingCart, Wallet } from 'lucide-react'
import { useClientStore } from '@/store/clientStore'
import { useFilterStore } from '@/store/filterStore'
import { useAuthStore } from '@/store/authStore'
import { MetricCard } from '@/components/ui/MetricCard'
import { TrendBadge } from '@/components/ui/TrendBadge'
import { Pagination } from '@/components/ui/Pagination'
import { formatCurrency, formatNumber } from '@/lib/formatters'

// "Live view" bar polls on this interval — ShopifyQL has no push/streaming
// feed, so this is the closest honest approximation of "live."
const LIVE_VIEW_POLL_MS = 3 * 60 * 1000

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopifyColumn {
  name: string
  dataType: string
  displayName: string
}

interface ShopifyReport {
  columns: ShopifyColumn[]
  rows: string[][]
}

interface TodaySummaryMetric {
  metric: 'visitors' | 'sessions' | 'orders' | 'totalSales'
  label: string
  today: number
  yesterday: number
  pctChange: number
}

interface OrderSummary {
  orders: number
  averageOrderValue: number
  unitsSold: number
  returnsValue: number
}

interface OrderSummaryResponse {
  current: OrderSummary
  previous: OrderSummary
  deltas: Record<keyof OrderSummary, number>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(value: string | undefined, colName: string): string {
  if (value === null || value === undefined || value === '') return '—'
  const v = value.toString()
  if (colName.includes('rate') || colName.includes('roas')) {
    const n = parseFloat(v)
    return isNaN(n) ? v : `${(n * 100).toFixed(1)}%`
  }
  if (colName.includes('gross') || colName.includes('net') || colName.includes('sales') ||
      colName.includes('discount') || colName.includes('return') || colName.includes('shipping') ||
      colName.includes('tax')) {
    const n = parseFloat(v)
    return isNaN(n) ? v : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return v
}

function colLabel(col: ShopifyColumn): string {
  return col.displayName || col.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

// ─── Not-connected prompt ─────────────────────────────────────────────────────

type ConnectMethod = 'app' | 'token'

function NotConnected({ clientId }: { clientId: string }) {
  const { setShopifyConnected } = useClientStore()
  const [method, setMethod] = useState<ConnectMethod>('app')
  const [shop, setShop] = useState('')
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const authToken = useAuthStore((s) => s.token)

  async function connectViaApp() {
    if (!shop.trim()) return
    setConnecting(true)
    setError(null)
    try {
      const params = new URLSearchParams({ shop: shop.trim(), clientId })
      const r = await fetch(`${API}/auth/shopify?${params.toString()}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Failed to start Shopify connect')
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message)
      setConnecting(false)
    }
  }

  async function connectViaToken() {
    if (!shop.trim() || !token.trim()) return
    setConnecting(true)
    setError(null)
    try {
      const r = await fetch(`${API}/auth/shopify/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ clientId, shopDomain: shop.trim(), accessToken: token.trim() }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Connection failed')
      setShopifyConnected(clientId, { shopDomain: data.shopDomain, shopName: data.shopName })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setConnecting(false)
    }
  }

  const storeInput = (
    <div className="flex items-center rounded-lg border border-theme overflow-hidden bg-surface-2 focus-within:ring-2 focus-within:ring-emerald-500/40">
      <span className="px-3 text-xs t3 shrink-0 border-r border-theme py-2.5">https://</span>
      <input
        type="text"
        value={shop}
        onChange={(e) => { setShop(e.target.value); setError(null) }}
        placeholder="dohar-india"
        className="flex-1 px-3 py-2.5 text-sm t1 bg-transparent focus:outline-none"
      />
      <span className="px-3 text-xs t3 shrink-0 border-l border-theme py-2.5">.myshopify.com</span>
    </div>
  )

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 max-w-sm mx-auto text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
        <ShoppingBag size={26} className="text-white" />
      </div>
      <div>
        <h2 className="text-lg font-bold t1">Connect Shopify Store</h2>
        <p className="text-sm t3 mt-1 leading-relaxed">
          Choose how to connect your store.
        </p>
      </div>

      {/* Method tabs */}
      <div className="flex w-full rounded-lg border border-theme overflow-hidden bg-surface-2 text-xs font-medium">
        <button
          onClick={() => { setMethod('app'); setError(null) }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${method === 'app' ? 'bg-emerald-600 text-white' : 't2 hover:t1'}`}
        >
          <Link2 size={12} /> Marktech App
        </button>
        <button
          onClick={() => { setMethod('token'); setError(null) }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${method === 'token' ? 'bg-emerald-600 text-white' : 't2 hover:t1'}`}
        >
          <Key size={12} /> Custom App Token
        </button>
      </div>

      {method === 'app' ? (
        <div className="w-full space-y-2 text-left">
          <p className="text-xs t3 leading-relaxed pb-1">
            Redirects to Shopify for the store admin to approve access — works for any store. No token to copy, and access doesn't expire.
          </p>
          {storeInput}
          {error && <p className="text-xs text-red-500 break-words">{error}</p>}
          <button
            onClick={connectViaApp}
            disabled={!shop.trim() || connecting}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white py-2.5 rounded-lg transition-colors"
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Connect via Marktech App
          </button>
        </div>
      ) : (
        <div className="w-full space-y-2 text-left">
          <p className="text-xs t3 leading-relaxed pb-1">
            For legacy custom apps. Get the token from: Store Admin → Apps → Develop apps → your app → API credentials → Install app.
          </p>
          {storeInput}
          <input
            type="password"
            value={token}
            onChange={(e) => { setToken(e.target.value); setError(null) }}
            onKeyDown={(e) => e.key === 'Enter' && connectViaToken()}
            placeholder="Admin API access token  (shpat_...)"
            className="w-full px-3 py-2.5 text-sm t1 bg-surface-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          {error && <p className="text-xs text-red-500 break-words">{error}</p>}
          <button
            onClick={connectViaToken}
            disabled={!shop.trim() || !token.trim() || connecting}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white py-2.5 rounded-lg transition-colors"
          >
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
            Connect with Token
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Live view bar ─────────────────────────────────────────────────────────────

const LIVE_VIEW_ICONS: Record<TodaySummaryMetric['metric'], React.ElementType> = {
  visitors: Eye,
  sessions: Users,
  orders: ShoppingCart,
  totalSales: Wallet,
}

function LiveViewBar({
  metrics, loading, error, lastUpdated,
}: {
  metrics: TodaySummaryMetric[] | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <h3 className="text-sm font-semibold t1">Live View</h3>
          <span className="text-[11px] t3">Today vs. yesterday, same time</span>
        </div>
        {lastUpdated && (
          <span className="text-[11px] t3">
            Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(metrics ?? []).map((m) => {
            const Icon = LIVE_VIEW_ICONS[m.metric]
            return (
              <MetricCard
                key={m.metric}
                label={m.label}
                value={m.metric === 'totalSales' ? formatCurrency(m.today) : formatNumber(m.today)}
                change={m.pctChange}
                improving={m.pctChange >= 0}
                icon={<Icon size={15} />}
                compareLabel="yesterday"
              />
            )
          })}
          {loading && !metrics && (
            <div className="col-span-2 lg:col-span-4 flex items-center gap-2 justify-center py-6 t3 text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading today's numbers…
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Report table ─────────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 10

function ReportTable({
  title,
  icon: Icon,
  report,
  loading,
  error,
  onRefresh,
  trendBadge,
}: {
  title: string
  icon: React.ElementType
  report: ShopifyReport | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  // Optional trend shown at the right of the header, next to Refresh — used
  // for a "vs yesterday" comparison that's independent of the page's
  // selected date range (see the Sales by Hour usage below).
  trendBadge?: React.ReactNode
}) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(ROWS_PER_PAGE)

  // A fresh report (new date range, refresh, etc.) should always start back at page 1.
  useEffect(() => { setPage(0) }, [report])

  const totalRows = report?.rows.length ?? 0
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const pagedRows = useMemo(
    () => report ? report.rows.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize) : [],
    [report, clampedPage, pageSize]
  )

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-emerald-500" />
          <span className="text-sm font-semibold t1">{title}</span>
          {report && (
            <span className="text-xs t3 font-normal">
              · {report.rows.length} row{report.rows.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {trendBadge}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium t2 hover:t1 border border-theme px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/5 border-b border-red-500/20">
          <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {loading && !report ? (
        <div className="flex items-center justify-center gap-2 py-16 t3 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : report && report.columns.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-2 border-b border-theme">
                  {report.columns.map((col) => (
                    <th
                      key={col.name}
                      className="px-3 py-2.5 text-left font-semibold t3 uppercase tracking-wide whitespace-nowrap"
                    >
                      {colLabel(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {pagedRows.map((row, ri) => (
                  <tr
                    key={clampedPage * pageSize + ri}
                    className="hover:bg-surface-2 transition-colors"
                  >
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2.5 t1 whitespace-nowrap">
                        {fmt(cell, report.columns[ci]?.name ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalRows > 0 && (
            <div className="px-4 pb-2.5">
              <Pagination
                page={clampedPage}
                totalItems={totalRows}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm t3">No data for this period.</p>
        </div>
      )}
    </div>
  )
}

// ─── Date range selector ──────────────────────────────────────────────────────

const DATE_OPTIONS = [
  { label: 'Last 7 days',  value: '7D' },
  { label: 'Last 30 days', value: '30D' },
  { label: 'Last 90 days', value: '90D' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ShopifyPage() {
  const { clientId } = useFilterStore()
  const { clients } = useClientStore()
  const token = useAuthStore((s) => s.token)

  const client = clients.find((c) => c.id === clientId)
  const shopify = client?.shopify

  const [dateRange, setDateRange] = useState('30D')
  const [salesChannel, setSalesChannel] = useState('')

  // Sessions state
  const [sessionsReport, setSessionsReport] = useState<ShopifyReport | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)

  // Sales state
  const [salesReport, setSalesReport] = useState<ShopifyReport | null>(null)
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesError, setSalesError] = useState<string | null>(null)

  // Live view (today vs yesterday) state
  const [todaySummary, setTodaySummary] = useState<TodaySummaryMetric[] | null>(null)
  const [todaySummaryLoading, setTodaySummaryLoading] = useState(false)
  const [todaySummaryError, setTodaySummaryError] = useState<string | null>(null)
  const [todaySummaryUpdatedAt, setTodaySummaryUpdatedAt] = useState<Date | null>(null)

  // Order summary (AOV / units sold / returns) state — scoped to the page's date range
  const [orderSummary, setOrderSummary] = useState<OrderSummaryResponse | null>(null)
  const [orderSummaryLoading, setOrderSummaryLoading] = useState(false)
  const [orderSummaryError, setOrderSummaryError] = useState<string | null>(null)

  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  const fetchSessions = useCallback(async () => {
    if (!clientId || !shopify?.connected) return
    setSessionsLoading(true)
    setSessionsError(null)
    try {
      const r = await fetch(
        `${API}/api/shopify/sessions?clientId=${encodeURIComponent(clientId)}&dateRange=${dateRange}`,
        { headers }
      )
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      setSessionsReport(json.data)
    } catch (e: any) {
      setSessionsError(e.message)
    } finally {
      setSessionsLoading(false)
    }
  }, [clientId, shopify?.connected, dateRange, token])

  const fetchSales = useCallback(async () => {
    if (!clientId || !shopify?.connected) return
    setSalesLoading(true)
    setSalesError(null)
    try {
      const params = new URLSearchParams({ clientId, dateRange })
      if (salesChannel) params.set('salesChannel', salesChannel)
      const r = await fetch(`${API}/api/shopify/sales?${params}`, { headers })
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      setSalesReport(json.data)
    } catch (e: any) {
      setSalesError(e.message)
    } finally {
      setSalesLoading(false)
    }
  }, [clientId, shopify?.connected, dateRange, salesChannel, token])

  const fetchTodaySummary = useCallback(async () => {
    if (!clientId || !shopify?.connected) return
    setTodaySummaryLoading(true)
    setTodaySummaryError(null)
    try {
      const r = await fetch(`${API}/api/shopify/today-summary?clientId=${encodeURIComponent(clientId)}`, { headers })
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      setTodaySummary(json.data)
      setTodaySummaryUpdatedAt(new Date())
    } catch (e: any) {
      setTodaySummaryError(e.message)
    } finally {
      setTodaySummaryLoading(false)
    }
  }, [clientId, shopify?.connected, token])

  const fetchOrderSummary = useCallback(async () => {
    if (!clientId || !shopify?.connected) return
    setOrderSummaryLoading(true)
    setOrderSummaryError(null)
    try {
      const r = await fetch(`${API}/api/shopify/order-summary?clientId=${encodeURIComponent(clientId)}&dateRange=${dateRange}`, { headers })
      const json = await r.json()
      if (json.error) throw new Error(json.error)
      setOrderSummary(json.data)
    } catch (e: any) {
      setOrderSummaryError(e.message)
    } finally {
      setOrderSummaryLoading(false)
    }
  }, [clientId, shopify?.connected, dateRange, token])

  // Fetch on mount and when connected / dateRange changes
  useEffect(() => {
    if (!shopify?.connected) return
    fetchSessions()
    fetchSales()
    fetchOrderSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopify?.connected, clientId, dateRange])

  // Live view polls independently of dateRange — it's always "today vs yesterday."
  useEffect(() => {
    if (!shopify?.connected) return
    fetchTodaySummary()
    const interval = setInterval(fetchTodaySummary, LIVE_VIEW_POLL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopify?.connected, clientId])

  // ── Not connected ──
  if (!shopify?.connected) {
    return <NotConnected clientId={clientId ?? 'default'} />
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold t1 flex items-center gap-2">
            <ShoppingBag size={20} className="text-emerald-500" />
            Shopify Analytics
          </h1>
          <p className="text-sm t3 mt-0.5">
            {shopify.shopName ?? shopify.shopDomain}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sales channel filter */}
          <input
            type="text"
            value={salesChannel}
            onChange={(e) => setSalesChannel(e.target.value)}
            placeholder="Sales channel (optional)"
            className="text-xs t1 bg-surface-2 border border-theme rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 w-44"
          />

          {/* Date range */}
          <div className="flex items-center rounded-lg border border-theme overflow-hidden bg-surface-2">
            {DATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dateRange === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 't2 hover:t1 hover:bg-surface-3'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live View */}
      <LiveViewBar
        metrics={todaySummary}
        loading={todaySummaryLoading}
        error={todaySummaryError}
        lastUpdated={todaySummaryUpdatedAt}
      />

      {/* Sessions Report */}
      <ReportTable
        title="Sessions by Landing Page"
        icon={MousePointerClick}
        report={sessionsReport}
        loading={sessionsLoading}
        error={sessionsError}
        onRefresh={() => { setSessionsReport(null); fetchSessions() }}
      />

      {/* Order Summary — AOV / units sold / refunds for the selected date range */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold t1">Order Summary</h3>
          {orderSummaryError && <span className="text-xs text-red-500">{orderSummaryError}</span>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Orders"
            value={orderSummary ? formatNumber(orderSummary.current.orders) : '—'}
            change={orderSummary?.deltas.orders ?? 0}
            improving={(orderSummary?.deltas.orders ?? 0) >= 0}
            icon={<ShoppingCart size={15} />}
          />
          <MetricCard
            label="Avg Order Value"
            value={orderSummary ? formatCurrency(orderSummary.current.averageOrderValue) : '—'}
            change={orderSummary?.deltas.averageOrderValue ?? 0}
            improving={(orderSummary?.deltas.averageOrderValue ?? 0) >= 0}
            icon={<Wallet size={15} />}
          />
          <MetricCard
            label="Units Sold"
            value={orderSummary ? formatNumber(orderSummary.current.unitsSold) : '—'}
            change={orderSummary?.deltas.unitsSold ?? 0}
            improving={(orderSummary?.deltas.unitsSold ?? 0) >= 0}
            icon={<ShoppingBag size={15} />}
          />
          <MetricCard
            label="Refunded"
            value={orderSummary ? formatCurrency(Math.abs(orderSummary.current.returnsValue)) : '—'}
            change={orderSummary?.deltas.returnsValue ?? 0}
            improving={(orderSummary?.deltas.returnsValue ?? 0) <= 0}
            icon={<AlertTriangle size={15} />}
          />
          {orderSummaryLoading && !orderSummary && (
            <div className="col-span-2 lg:col-span-4 flex items-center gap-2 justify-center py-4 t3 text-sm">
              <Loader2 size={14} className="animate-spin" /> Loading order summary…
            </div>
          )}
        </div>
      </div>

      {/* Sales Report */}
      <ReportTable
        title="Sales by Hour"
        icon={TrendingUp}
        report={salesReport}
        loading={salesLoading}
        error={salesError}
        onRefresh={() => { setSalesReport(null); fetchSales() }}
        trendBadge={(() => {
          const totalSalesToday = todaySummary?.find((m) => m.metric === 'totalSales')
          if (!totalSalesToday) return null
          return (
            <div className="flex items-center gap-2 text-xs">
              <span className="t3">Today {formatCurrency(totalSalesToday.today)}</span>
              <TrendBadge change={totalSalesToday.pctChange} improving={totalSalesToday.pctChange >= 0} />
              <span className="t3">vs yesterday</span>
            </div>
          )
        })()}
      />
    </div>
  )
}
