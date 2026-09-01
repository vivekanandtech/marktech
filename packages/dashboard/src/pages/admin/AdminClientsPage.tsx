import { useEffect, useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Loader2, ChevronRight } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import type { ServerClient } from '@/store/clientStore'
import { useClientStore } from '@/store/clientStore'

export function AdminClientsPage() {
  const [clients, setClients] = useState<ServerClient[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const { createClient } = useClientStore()

  function load() {
    apiFetch('/api/clients')
      .then((r) => r.json())
      .then((data) => setClients(data.clients ?? []))
      .catch((e) => setError(e.message))
  }

  useEffect(() => { load() }, [])

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold t1">Clients</h1>
          <p className="text-sm t3 mt-0.5">Every client on the platform — create new ones, manage users and connections</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={13} /> New client
        </button>
      </div>

      {showAdd && (
        <AddClientForm
          onDone={() => { setShowAdd(false); load() }}
          createClient={createClient}
        />
      )}

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">{error}</div>}

      {clients === null ? (
        <div className="flex items-center gap-2 text-sm t3 py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading clients…
        </div>
      ) : clients.length === 0 ? (
        <div className="card p-8 flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-semibold t1">No clients yet</p>
          <p className="text-xs t3">Create your first client to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <Link
              key={c.id}
              to={`/admin/clients/${c.id}`}
              className="card p-4 flex items-center gap-3 hover:bg-surface-2 transition-colors"
            >
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: c.logoColor }}
              >
                {c.logoInitials}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold t1 truncate">{c.name}</p>
                {c.industry && <p className="text-xs t3 truncate">{c.industry}</p>}
              </div>
              <ChevronRight size={16} className="t3 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function AddClientForm({ onDone, createClient }: { onDone: () => void; createClient: (name: string, industry: string) => Promise<unknown> }) {
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createClient(name, industry)
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 border-dashed space-y-3">
      <p className="text-xs font-semibold t2 uppercase tracking-wide">New client</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name  e.g. Dohar India"
        className="w-full text-sm t1 bg-surface-2 border border-theme rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      />
      <input
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        placeholder="Industry (optional)"
        className="w-full text-sm t1 bg-surface-2 border border-theme rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={!name.trim() || saving}
        className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create client
      </button>
    </form>
  )
}
