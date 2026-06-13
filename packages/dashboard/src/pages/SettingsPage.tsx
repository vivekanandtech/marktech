import { useEffect, useState, FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle, XCircle, Loader2, Link2, Unlink,
  Plus, Trash2, Pencil, X, Check, ChevronDown,
} from 'lucide-react'
import { useClientStore, type Client } from '@/store/clientStore'
import { useFilterStore } from '@/store/filterStore'
import { useMetaStore } from '@/store/metaStore'
import { syncMetaStatus } from '@/App'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

// ─── Ad account selection screen ───────────────────────────────────────────────
// Shown right after connecting (or when the user clicks "Edit accounts").
// Nothing the user leaves unchecked is ever stored, fetched, or shown elsewhere.
function AdAccountSelector() {
  const { adAccounts, setEnabledAdAccountIds } = useMetaStore()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(adAccounts.length === 1 ? [adAccounts[0].id] : [])
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Group by Business Portfolio so it's clear which client each account belongs to
  const groups = new Map<string, { label: string; accounts: typeof adAccounts }>()
  for (const acc of adAccounts) {
    const key = acc.business?.id ?? '_none'
    const label = acc.business?.name ?? 'Other assets (no business portfolio)'
    if (!groups.has(key)) groups.set(key, { label, accounts: [] })
    groups.get(key)!.accounts.push(acc)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold t1">Choose which ad accounts Marktech can use</p>
        <p className="text-xs t3 mt-1 leading-relaxed">
          This Meta login has access to {adAccounts.length} ad account{adAccounts.length !== 1 ? 's' : ''} across{' '}
          {groups.size} portfolio{groups.size !== 1 ? 's' : ''}. Only the ones you check below will ever be visible
          in Marktech — everything else stays completely hidden.
        </p>
      </div>

      <div className="space-y-3">
        {[...groups.entries()].map(([key, group]) => (
          <div key={key} className="rounded-lg border border-theme bg-surface-2 overflow-hidden">
            <p className="text-[11px] font-semibold uppercase tracking-wide t3 px-3 py-2 bg-surface-3 border-b border-theme">
              {group.label}
            </p>
            <div className="divide-y divide-theme">
              {group.accounts.map((acc) => (
                <label
                  key={acc.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-3 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(acc.id)}
                    onChange={() => toggle(acc.id)}
                    className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium t1 truncate">{acc.name}</p>
                    <p className="text-[11px] t3">{acc.id}</p>
                  </div>
                  <span className="text-[11px] font-medium bg-surface-3 border border-theme px-2 py-0.5 rounded-md t2">
                    {acc.currency}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          onClick={() => setSelected(new Set(adAccounts.map((a) => a.id)))}
          className="text-xs font-medium t2 hover:t1 transition-colors"
        >
          Select all
        </button>
        <button
          onClick={() => setEnabledAdAccountIds([...selected])}
          disabled={selected.size === 0}
          className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Confirm selection ({selected.size})
        </button>
      </div>
    </div>
  )
}

// ─── Global Meta connection card ──────────────────────────────────────────────
function MetaConnectionCard() {
  const { connected, adAccounts, enabledAdAccountIds, expiresAt, setDisconnected, reopenAdAccountSelector } = useMetaStore()
  const { clientId } = useFilterStore()
  const [disconnecting, setDisconnecting] = useState(false)

  async function disconnect() {
    setDisconnecting(true)
    try {
      await fetch(`${API}/auth/meta/disconnect?clientId=${clientId}`, { method: 'DELETE' })
      setDisconnected()
    } finally {
      setDisconnecting(false)
    }
  }

  const enabledAccounts = adAccounts.filter((acc) => enabledAdAccountIds?.includes(acc.id))

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#1877F2]/10 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#1877F2]">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold t1">Meta Ads</p>
          <p className="text-xs t3">Connect once — assign ad accounts to each client below</p>
        </div>
      </div>

      {connected && enabledAdAccountIds === null ? (
        <AdAccountSelector />
      ) : connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Connected</span>
            <span className="text-xs t3">· {enabledAccounts.length} of {adAccounts.length} ad account{adAccounts.length !== 1 ? 's' : ''} enabled</span>
          </div>

          <div className="rounded-lg border border-theme bg-surface-2 divide-y divide-theme overflow-hidden">
            {enabledAccounts.map((acc) => (
              <div key={acc.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-xs font-medium t1">{acc.name}</p>
                  <p className="text-[11px] t3">{acc.id}{acc.business?.name ? ` · ${acc.business.name}` : ''}</p>
                </div>
                <span className="text-[11px] font-medium bg-surface-3 border border-theme px-2 py-0.5 rounded-md t2">{acc.currency}</span>
              </div>
            ))}
            {enabledAccounts.length === 0 && (
              <div className="px-3 py-2 text-xs t3">No ad accounts enabled yet.</div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[11px] t3">
              Expires {expiresAt ? new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={reopenAdAccountSelector}
                className="text-xs font-medium t2 hover:t1 transition-colors"
              >
                Edit accounts
              </button>
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
              >
                {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs t3">
            Connect your Meta Business account to pull live campaign data for all your clients in one go.
          </p>
          <a
            href={`${API}/auth/meta?clientId=${clientId || 'default'}`}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-semibold px-4 py-2 transition-colors"
          >
            <Link2 size={13} /> Connect Meta Ads
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Per-client ad account assignment ────────────────────────────────────────
function ClientAdAccountRow({ client }: { client: Client }) {
  const { adAccounts, connected, enabledAdAccountIds } = useMetaStore()
  const { assignAdAccount } = useClientStore()

  const availableAccounts = adAccounts.filter((acc) => enabledAdAccountIds?.includes(acc.id))

  if (!connected || availableAccounts.length === 0) {
    return (
      <div className="flex items-center gap-2 mt-3 text-xs t3">
        <span className="w-1.5 h-1.5 rounded-full bg-surface-3 border border-theme shrink-0" />
        {!connected
          ? 'Connect Meta Ads above to assign an ad account'
          : 'Enable at least one ad account above to assign it here'}
      </div>
    )
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#1877F2] shrink-0">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
      </svg>
      <div className="relative flex-1">
        <select
          value={client.metaAdAccountId ?? ''}
          onChange={(e) => assignAdAccount(client.id, e.target.value || null)}
          className="w-full appearance-none text-xs t1 bg-surface-2 border border-theme rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
        >
          <option value="">— Select ad account —</option>
          {availableAccounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} ({acc.currency})
            </option>
          ))}
        </select>
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 t3 pointer-events-none" />
      </div>
      {client.metaAdAccountId && (
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Ad account assigned" />
      )}
    </div>
  )
}

// ─── Client card ──────────────────────────────────────────────────────────────
function ClientCard({ client }: { client: Client }) {
  const { removeClient, updateClient } = useClientStore()
  const { clientId, setClientId } = useFilterStore()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(client.name)
  const [editIndustry, setEditIndustry] = useState(client.industry)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function saveEdit() {
    if (!editName.trim()) return
    updateClient(client.id, { name: editName, industry: editIndustry })
    setEditing(false)
  }

  function handleDelete() {
    if (clientId === client.id) setClientId('')
    removeClient(client.id)
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ backgroundColor: client.logoColor }}
        >
          {client.logoInitials}
        </span>

        {editing ? (
          <div className="flex-1 flex flex-col gap-1.5">
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="Client name"
              className="text-sm font-medium t1 bg-surface-2 border border-indigo-500/50 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 w-full"
            />
            <input
              value={editIndustry}
              onChange={(e) => setEditIndustry(e.target.value)}
              placeholder="Industry (optional)"
              className="text-xs t2 bg-surface-2 border border-theme rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 w-full"
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold t1 truncate">{client.name}</p>
            <p className="text-xs t3 truncate">{client.industry}</p>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <button onClick={saveEdit} className="p-1.5 rounded-md text-emerald-500 hover:bg-emerald-500/10 transition-colors"><Check size={13} /></button>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded-md t3 hover:bg-surface-2 transition-colors"><X size={13} /></button>
            </>
          ) : confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-red-500">Remove?</span>
              <button onClick={handleDelete} className="text-[11px] font-semibold text-red-500 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-500/10 transition-colors">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[11px] t3 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors">No</button>
            </div>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-md t3 hover:t1 hover:bg-surface-2 transition-colors"><Pencil size={13} /></button>
              <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-md t3 hover:text-red-500 hover:bg-red-500/10 transition-colors"><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>

      <ClientAdAccountRow client={client} />
    </div>
  )
}

// ─── Add client form ──────────────────────────────────────────────────────────
function AddClientForm({ onDone }: { onDone: (id: string) => void }) {
  const { addClient } = useClientStore()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const client = addClient(name, industry)
    onDone(client.id)
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 border-dashed space-y-3">
      <p className="text-xs font-semibold t2 uppercase tracking-wide">New client</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name  e.g. Velora Fashion"
        className="w-full text-sm t1 bg-surface-2 border border-theme rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      />
      <input
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        placeholder="Industry  e.g. Fashion & Apparel  (optional)"
        className="w-full text-sm t1 bg-surface-2 border border-theme rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
      >
        <Plus size={13} /> Add client
      </button>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { clients } = useClientStore()
  const { setClientId } = useFilterStore()
  const { setConnected } = useMetaStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showAddForm, setShowAddForm] = useState(false)

  const oauthResult = searchParams.get('meta')
  const oauthReason = searchParams.get('reason')
  const oauthAccounts = searchParams.get('accounts')

  useEffect(() => {
    if (oauthResult === 'connected') {
      const at = searchParams.get('at')
      const uid = searchParams.get('uid')
      const accRaw = searchParams.get('acc')
      const exp = searchParams.get('exp')

      if (at && uid && accRaw) {
        try {
          const adAccounts = JSON.parse(decodeURIComponent(accRaw))
          setConnected({
            accessToken: at,
            metaUserId: uid,
            adAccounts,
            expiresAt: exp ?? new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
          })
        } catch { /* ignore */ }
      } else {
        const { clientId } = useFilterStore.getState()
        syncMetaStatus(clientId)
      }

      const t = setTimeout(() => setSearchParams({}, { replace: true }), 5000)
      return () => clearTimeout(t)
    }
    if (oauthResult === 'error') {
      const t = setTimeout(() => setSearchParams({}, { replace: true }), 5000)
      return () => clearTimeout(t)
    }
  }, [oauthResult])

  function handleClientAdded(id: string) {
    setClientId(id)
    setShowAddForm(false)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl font-bold t1">Clients & Integrations</h1>
        <p className="text-sm t3 mt-0.5">Connect Meta once, then map each client to their ad account</p>
      </div>

      {oauthResult === 'connected' && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Meta Ads connected successfully</p>
            {oauthAccounts && (
              <p className="text-xs t3 mt-0.5">Now assign each client below to their ad account</p>
            )}
          </div>
        </div>
      )}
      {oauthResult === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <XCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">Meta connection failed</p>
            {oauthReason && <p className="text-xs t3 mt-0.5">{decodeURIComponent(oauthReason)}</p>}
          </div>
        </div>
      )}

      {/* Single global Meta connection */}
      <MetaConnectionCard />

      {/* Client list with ad account assignment */}
      <div>
        <p className="text-xs font-semibold t2 uppercase tracking-wide mb-3">Clients</p>

        <div className="space-y-3">
          {clients.length === 0 && !showAddForm && (
            <div className="card p-8 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-surface-2 border border-dashed border-theme flex items-center justify-center">
                <Plus size={20} className="t3" />
              </div>
              <div>
                <p className="text-sm font-semibold t1">No clients yet</p>
                <p className="text-xs t3 mt-0.5">Add your first client to get started</p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                + Add client
              </button>
            </div>
          )}

          {clients.map((c) => <ClientCard key={c.id} client={c} />)}
          {showAddForm && <AddClientForm onDone={handleClientAdded} />}
        </div>

        {clients.length > 0 && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 text-xs font-medium t2 hover:t1 border border-dashed border-theme hover:border-indigo-500/50 rounded-xl px-4 py-3 w-full transition-colors mt-3"
          >
            <Plus size={14} /> Add another client
          </button>
        )}
      </div>

      {/* Google Ads coming soon */}
      <div className="pt-2 border-t border-theme">
        <div className="flex items-center gap-3 opacity-50">
          <div className="w-7 h-7 rounded-md bg-surface-2 border border-theme flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold t1">Google Ads</p>
            <p className="text-xs t3">Search, Shopping & YouTube</p>
          </div>
          <span className="ml-auto text-[11px] font-medium bg-surface-2 border border-theme px-2 py-0.5 rounded-md t3">Coming soon</span>
        </div>
      </div>
    </div>
  )
}
