import { useEffect, useState, useCallback, FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle, XCircle, Loader2, Link2, Unlink,
  RefreshCw, AlertTriangle, Plus, Trash2, Pencil, X, Check,
} from 'lucide-react'
import { useClientStore, type Client } from '@/store/clientStore'
import { useFilterStore } from '@/store/filterStore'
import { useMetaStore } from '@/store/metaStore'
import { syncMetaStatus } from '@/App'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

const META_LOGO = (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#1877F2]">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
)

// ─── Per-client Meta connection row ──────────────────────────────────────────
function MetaConnectionRow({ clientId }: { clientId: string }) {
  const { setDisconnected } = useMetaStore()
  const { clientId: activeClientId } = useFilterStore()
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/meta/status?clientId=${clientId}`)
      const data = await res.json()
      setStatus(data)
      // Keep global metaStore in sync for the currently selected client
      if (clientId === activeClientId) {
        await syncMetaStatus(clientId)
      }
    } finally {
      setLoading(false)
    }
  }, [clientId, activeClientId])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function disconnect() {
    setDisconnecting(true)
    try {
      await fetch(`${API}/auth/meta/disconnect?clientId=${clientId}`, { method: 'DELETE' })
      setStatus({ connected: false })
      if (clientId === activeClientId) setDisconnected()
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-2 border border-theme px-3 py-2.5 mt-3">
      <div className="w-6 h-6 rounded-md bg-[#1877F2]/10 flex items-center justify-center shrink-0">
        {META_LOGO}
      </div>
      <span className="text-xs font-medium t2 shrink-0">Meta Ads</span>

      {loading ? (
        <span className="flex items-center gap-1 text-xs t3 flex-1"><Loader2 size={11} className="animate-spin" /> Checking…</span>
      ) : status?.connected ? (
        <>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Connected</span>
            </div>
            <p className="text-[11px] t3 truncate mt-0.5">
              {status.adAccounts?.map((a: any) => a.name).join(', ')}
              {' · expires '}
              {new Date(status.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={fetchStatus} className="p-1 t3 hover:t1 transition-colors" title="Refresh">
              <RefreshCw size={11} />
            </button>
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
            >
              {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <Unlink size={11} />} Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-surface-3 border border-theme shrink-0" />
            <span className="text-xs t3">Not connected</span>
            {status?.reason === 'token_expired' && (
              <span className="flex items-center gap-1 text-[11px] text-amber-500"><AlertTriangle size={10} /> Expired</span>
            )}
          </div>
          <a
            href={`${API}/auth/meta?clientId=${clientId}`}
            className="flex items-center gap-1.5 text-[11px] font-semibold bg-[#1877F2] hover:bg-[#166fe5] text-white px-2.5 py-1.5 rounded-md transition-colors shrink-0"
          >
            <Link2 size={11} /> Connect
          </a>
        </>
      )}
    </div>
  )
}

// ─── Single client card ───────────────────────────────────────────────────────
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
              <button onClick={saveEdit} className="p-1.5 rounded-md text-emerald-500 hover:bg-emerald-500/10 transition-colors" title="Save">
                <Check size={13} />
              </button>
              <button onClick={() => setEditing(false)} className="p-1.5 rounded-md t3 hover:bg-surface-2 transition-colors" title="Cancel">
                <X size={13} />
              </button>
            </>
          ) : confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-red-500">Remove?</span>
              <button onClick={handleDelete} className="text-[11px] font-semibold text-red-500 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-500/10 transition-colors">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[11px] t3 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors">No</button>
            </div>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-md t3 hover:t1 hover:bg-surface-2 transition-colors" title="Edit">
                <Pencil size={13} />
              </button>
              <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-md t3 hover:text-red-500 hover:bg-red-500/10 transition-colors" title="Remove">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      <MetaConnectionRow clientId={client.id} />
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
        className="w-full text-sm t1 bg-surface-2 border border-theme rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50"
      />
      <input
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        placeholder="Industry  e.g. Fashion & Apparel  (optional)"
        className="w-full text-sm t1 bg-surface-2 border border-theme rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={13} /> Add client
        </button>
      </div>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { clients } = useClientStore()
  const { setClientId } = useFilterStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showAddForm, setShowAddForm] = useState(false)

  const oauthResult = searchParams.get('meta')
  const oauthReason = searchParams.get('reason')
  const oauthAccounts = searchParams.get('accounts')

  useEffect(() => {
    if (oauthResult === 'connected') {
      // Re-sync the active client's status so MetaAdsPage shows live data immediately
      const { clientId } = useFilterStore.getState()
      syncMetaStatus(clientId)
      const t = setTimeout(() => setSearchParams({}, { replace: true }), 5000)
      return () => clearTimeout(t)
    }
    if (oauthResult === 'error') {
      const t = setTimeout(() => setSearchParams({}, { replace: true }), 5000)
      return () => clearTimeout(t)
    }
  }, [oauthResult, setSearchParams])

  function handleClientAdded(id: string) {
    setClientId(id)
    setShowAddForm(false)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl font-bold t1">Clients & Integrations</h1>
        <p className="text-sm t3 mt-0.5">Add clients and connect their ad accounts</p>
      </div>

      {/* OAuth result banner */}
      {oauthResult === 'connected' && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Meta Ads connected successfully</p>
            {oauthAccounts && (
              <p className="text-xs t3 mt-0.5">Ad accounts: {decodeURIComponent(oauthAccounts).split(',').join(', ')}</p>
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

      {/* Client list */}
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

        {showAddForm && (
          <AddClientForm onDone={handleClientAdded} />
        )}
      </div>

      {/* Add client button */}
      {clients.length > 0 && !showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 text-xs font-medium t2 hover:t1 border border-dashed border-theme hover:border-indigo-500/50 rounded-xl px-4 py-3 w-full transition-colors"
        >
          <Plus size={14} /> Add another client
        </button>
      )}

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
