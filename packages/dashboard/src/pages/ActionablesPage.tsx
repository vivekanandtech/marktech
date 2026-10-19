import { useEffect, useState } from 'react'
import { ListChecks, RefreshCw, Loader2, FileDown, AlertTriangle, ChevronsUpDown } from 'lucide-react'
import clsx from 'clsx'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { useActionablesStore, ActionableCategory, Actionable } from '@/store/actionablesStore'
import { ActionableCard, CATEGORY_CONFIG } from '@/components/actionables/ActionableCard'
import { exportActionablesDocx } from '@/lib/exports'

const CATEGORY_ORDER: ActionableCategory[] = ['tracking', 'scale', 'fix', 'creative', 'geography', 'budget']
const STATUS_ORDER: Record<Actionable['status'], number> = { new: 0, done: 1, dismissed: 2 }

function StatChip({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex-1 min-w-[90px] rounded-xl border border-theme bg-surface-2 px-3 py-2.5">
      <p className={clsx('text-xl font-bold', accent ?? 't1')}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide t3 mt-0.5">{label}</p>
    </div>
  )
}

export function ActionablesPage() {
  const clientId = useFilterStore((s) => s.clientId)
  const dateRange = useFilterStore((s) => s.dateRange)
  const { clients } = useClientStore()
  const { payload, generating, error, fetchedForClient, fetchLatest, generate } = useActionablesStore()
  const [categoryFilter, setCategoryFilter] = useState<ActionableCategory | 'all'>('all')
  const [expandAll, setExpandAll] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const currentClient = clients.find((c) => c.id === clientId)
  const metaAdAccountId = currentClient?.metaAdAccountId ?? null
  const connectedSomewhere = !!(currentClient?.meta.connected || currentClient?.shopify.connected || currentClient?.google?.connected)

  useEffect(() => {
    if (connectedSomewhere && fetchedForClient !== clientId) fetchLatest(clientId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, connectedSomewhere])

  const items = payload?.items ?? []
  const sorted = [...items].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.rank - b.rank)
  const filtered = categoryFilter === 'all' ? sorted : sorted.filter((i) => i.category === categoryFilter)
  const counts = CATEGORY_ORDER.reduce((acc, c) => ({ ...acc, [c]: items.filter((i) => i.category === c).length }), {} as Record<ActionableCategory, number>)
  const openCount = items.filter((i) => i.status === 'new').length
  const doneCount = items.filter((i) => i.status === 'done').length
  const dismissedCount = items.filter((i) => i.status === 'dismissed').length
  const staleWindow = payload && payload.dateRange !== dateRange
  // Generated against a different Meta ad account than the one selected now
  // (older payloads only recorded the name, so fall back to comparing names).
  const currentAccount = currentClient?.meta.adAccounts.find((a) => a.id === metaAdAccountId)
  const staleAccount = !!payload && !!metaAdAccountId && (payload.metaAccountId
    ? payload.metaAccountId !== metaAdAccountId
    : !!payload.metaAccountName && !!currentAccount && payload.metaAccountName !== currentAccount.name)

  async function handleExport() {
    if (!payload) return
    setExportError(null)
    try { await exportActionablesDocx(payload) }
    catch (e: any) { setExportError(e.message ?? 'Export failed') }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold t1 flex items-center gap-2">
            <ListChecks size={18} className="text-indigo-500" /> Actionables
          </h1>
          <p className="text-sm t3 mt-0.5">
            What to change next, ranked by money at stake — Meta and Google numbers checked against Shopify revenue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={!payload || items.length === 0}
            className="flex items-center gap-1.5 text-xs font-semibold border border-theme bg-surface-2 hover:bg-surface-3 disabled:opacity-50 t2 px-3 py-1.5 rounded-lg transition-colors"
            title="Download all open and done actionables as a Word document"
          >
            <FileDown size={12} /> Export Word
          </button>
          <button
            onClick={() => generate(clientId, dateRange)}
            disabled={!connectedSomewhere || generating}
            className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {items.length > 0 ? `Refresh for ${dateRange}` : 'Generate actionables'}
          </button>
        </div>
      </div>

      {payload?.generatedAt && (
        <p className="text-[11px] t3 -mt-3">
          Generated {new Date(payload.generatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} for {payload.window.since} → {payload.window.until} ({payload.dateRange})
          {payload.metaAccountName && <> · Meta account: <span className="font-medium t2">{payload.metaAccountName}</span></>}
          {staleWindow && <span className="text-amber-600 dark:text-amber-400"> · Header is set to {dateRange} — refresh to match</span>}
        </p>
      )}

      {staleAccount && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            These actionables were built for the Meta account <span className="font-semibold">{payload?.metaAccountName ?? 'previously selected'}</span>, but <span className="font-semibold">{currentAccount?.name ?? 'a different account'}</span> is selected now.
          </span>
          <button onClick={() => generate(clientId, dateRange)} disabled={generating}
            className="flex items-center gap-1.5 font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg px-2.5 py-1.5">
            {generating ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Refresh for {currentAccount?.name ?? 'current account'}
          </button>
        </div>
      )}

      {!connectedSomewhere && (
        <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
          <ListChecks size={28} className="t3" />
          <p className="t2 text-sm max-w-sm">Connect Meta, Google, or Shopify to generate actionables.</p>
        </div>
      )}

      {(error || exportError) && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">{error ?? exportError}</div>
      )}

      {connectedSomewhere && generating && items.length === 0 && (
        <div className="flex items-center gap-2 text-sm t3 py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> Analysing ad sets, ads, markets and Shopify revenue…
        </div>
      )}

      {connectedSomewhere && !generating && !payload && !error && (
        <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
          <ListChecks size={28} className="t3 opacity-40" />
          <p className="t2 text-sm max-w-sm">Click "Generate actionables" to analyse this account for the {dateRange} window.</p>
        </div>
      )}

      {payload && items.length === 0 && (
        <div className="card flex flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="t2 text-sm max-w-md">No actions needed for this window — nothing stands out as clearly over- or under-performing.</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="flex gap-2 flex-wrap">
            <StatChip label="Total" value={items.length} />
            <StatChip label="Open" value={openCount} accent="text-indigo-500" />
            <StatChip label="Done" value={doneCount} accent="text-emerald-500" />
            <StatChip label="Dismissed" value={dismissedCount} accent="t3" />
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setCategoryFilter('all')}
                className={clsx('px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                  categoryFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 't2 border-theme hover:t1')}
              >
                All ({items.length})
              </button>
              {CATEGORY_ORDER.filter((c) => counts[c] > 0).map((c) => {
                const cfg = CATEGORY_CONFIG[c]
                const Icon = cfg.icon
                return (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                      categoryFilter === c ? cfg.classes : 't2 border-theme hover:t1')}
                  >
                    <Icon size={12} /> {cfg.label} ({counts[c]})
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setExpandAll((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-medium t3 hover:t1 transition-colors"
            >
              <ChevronsUpDown size={12} /> {expandAll ? 'Collapse all' : 'Expand all'}
            </button>
          </div>

          <div className="space-y-2">
            {filtered.map((a, i) => (
              <ActionableCard
                key={`${a.id}:${expandAll}`}
                a={a}
                index={i + 1}
                clientId={clientId}
                metaAdAccountId={metaAdAccountId}
                defaultOpen={expandAll || i === 0}
              />
            ))}
          </div>
        </>
      )}

      {payload && payload.notes.length > 0 && (
        <div className="flex items-start gap-2 text-[11px] t3 border-t border-theme pt-3">
          <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-medium t2">Some data couldn't be fetched for this run, so a few checks were skipped:</p>
            <ul className="list-disc pl-4 mt-0.5">{payload.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </div>
      )}
    </div>
  )
}
