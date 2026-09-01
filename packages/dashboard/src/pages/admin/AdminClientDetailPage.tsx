import { useEffect, useState, FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Loader2, UserPlus, Mail, Save, ShoppingBag, Link2, Copy } from 'lucide-react'
import clsx from 'clsx'
import { apiFetch } from '@/lib/api'
import { useClientStore, type ThresholdSetting, type Client } from '@/store/clientStore'
import { useFilterStore } from '@/store/filterStore'
import { syncMetaStatus, syncGoogleStatus, syncShopifyStatus } from '@/App'
import { ClientMetaSection, ClientShopifySection, ClientGoogleSection } from '@/components/clients/ConnectionSections'
import { THRESHOLDS } from '@/lib/metric-thresholds'

interface ClientUserRow { id: string; name: string; email: string }

// Lets an admin register a client's OWN Shopify app (Client ID/Secret from
// their distributable Custom Distribution app) and generate a one-time
// install link to send them — rather than every client sharing the single
// global Shopify app, which meant only one client's store could be
// authenticated at a time. Once saved, the OAuth routes automatically use
// this client's own app for their connect/reconnect flow (see
// getShopifyAppCredentials in the API's services/shopify.ts).
function ShopifyInstallLinkTool({ clientId, client }: { clientId: string; client: Client }) {
  const { setClientSettings } = useClientStore()
  const configured = client.settings.shopifyApp?.configured
  const [editingCreds, setEditingCreds] = useState(!configured)
  const [appClientId, setAppClientId] = useState(client.settings.shopifyApp?.clientId ?? '')
  const [appClientSecret, setAppClientSecret] = useState('')
  const [savingCreds, setSavingCreds] = useState(false)
  const [credsError, setCredsError] = useState<string | null>(null)

  const [shop, setShop] = useState('')
  const [installLink, setInstallLink] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function saveCreds() {
    if (!appClientId.trim() || !appClientSecret.trim()) return
    setSavingCreds(true)
    setCredsError(null)
    try {
      const r = await apiFetch(`/api/clients/${clientId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyApp: { clientId: appClientId.trim(), clientSecret: appClientSecret.trim() } }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Failed to save')
      setClientSettings(clientId, data.settings)
      setAppClientSecret('')
      setEditingCreds(false)
    } catch (e: any) {
      setCredsError(e.message)
    } finally {
      setSavingCreds(false)
    }
  }

  async function generateLink() {
    if (!shop.trim()) return
    setGenerating(true)
    setLinkError(null)
    setInstallLink(null)
    try {
      const params = new URLSearchParams({ clientId, shop: shop.trim() })
      const r = await apiFetch(`/auth/shopify?${params}`)
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Failed to generate install link')
      setInstallLink(data.url)
    } catch (e: any) {
      setLinkError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function copyLink() {
    if (!installLink) return
    await navigator.clipboard.writeText(installLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border border-theme p-3 space-y-3 mb-3">
      <div className="flex items-center gap-1.5">
        <ShoppingBag size={12} className="text-emerald-500" />
        <p className="text-xs font-semibold t2">Shopify app for this client</p>
      </div>

      {editingCreds ? (
        <div className="space-y-2">
          <p className="text-[11px] t3 leading-relaxed">
            From this client's own Shopify Partner app (Custom Distribution) — App setup → Client ID / Client Secret.
          </p>
          <input
            value={appClientId}
            onChange={(e) => setAppClientId(e.target.value)}
            placeholder="Shopify app Client ID"
            className="w-full px-2 py-1.5 text-xs t1 bg-surface-3 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
          />
          <input
            type="password"
            value={appClientSecret}
            onChange={(e) => setAppClientSecret(e.target.value)}
            placeholder="Shopify app Client Secret"
            className="w-full px-2 py-1.5 text-xs t1 bg-surface-3 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 font-mono"
          />
          {credsError && <p className="text-[11px] text-red-500">{credsError}</p>}
          <button
            onClick={saveCreds}
            disabled={!appClientId.trim() || !appClientSecret.trim() || savingCreds}
            className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {savingCreds ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save app credentials
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-[11px] t3">
            App configured (Client ID: <span className="font-mono">{client.settings.shopifyApp?.clientId}</span>)
          </p>
          <button onClick={() => setEditingCreds(true)} className="text-[11px] font-medium t2 hover:t1 transition-colors">
            Change
          </button>
        </div>
      )}

      {!editingCreds && (
        <div className="space-y-2 pt-2 border-t border-theme">
          <div className="flex items-center rounded-lg border border-theme overflow-hidden bg-surface-3 focus-within:ring-2 focus-within:ring-emerald-500/30">
            <span className="px-2 text-[11px] t3 shrink-0 border-r border-theme py-2">https://</span>
            <input
              type="text"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
              placeholder="sheetal-batra"
              className="flex-1 px-2 py-2 text-xs t1 bg-transparent focus:outline-none min-w-0"
            />
            <span className="px-2 text-[11px] t3 shrink-0 border-l border-theme py-2">.myshopify.com</span>
          </div>
          <button
            onClick={generateLink}
            disabled={!shop.trim() || generating}
            className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} Generate install link
          </button>
          {linkError && <p className="text-[11px] text-red-500">{linkError}</p>}
          {installLink && (
            <div className="rounded-lg bg-surface-2 border border-theme p-2.5 space-y-2">
              <p className="text-[11px] t3">Send this link to the client — they open it while logged into their store admin and click Install:</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={installLink}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 text-[11px] font-mono t1 bg-surface-3 border border-theme rounded px-2 py-1.5 min-w-0"
                />
                <button
                  onClick={copyLink}
                  className="flex items-center gap-1 text-[11px] font-semibold t2 hover:t1 border border-theme rounded-lg px-2 py-1.5 shrink-0 transition-colors"
                >
                  <Copy size={11} /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const THRESHOLD_METRICS: { id: string; label: string; higherIsBetter: boolean }[] = [
  { id: 'mer', label: 'MER', higherIsBetter: true },
  { id: 'attributedCPR', label: 'Attributed CPR (₹)', higherIsBetter: false },
  { id: 'nCAC', label: 'New-Cust CAC (₹)', higherIsBetter: false },
  { id: 'overClaimMultiplier', label: 'Platform Over-claim (×)', higherIsBetter: false },
]

function SettingsTab({ clientId }: { clientId: string }) {
  const { clients, setClientSettings } = useClientStore()
  const client = clients.find((c) => c.id === clientId)
  const [values, setValues] = useState<Record<string, ThresholdSetting>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const merged: Record<string, ThresholdSetting> = {}
    for (const m of THRESHOLD_METRICS) {
      merged[m.id] = client?.settings.thresholds?.[m.id] ?? { good: THRESHOLDS[m.id]!.good, bad: THRESHOLDS[m.id]!.bad }
    }
    setValues(merged)
  }, [client])

  function update(metricId: string, field: 'good' | 'bad', raw: string) {
    const num = parseFloat(raw)
    setValues((v) => ({ ...v, [metricId]: { ...v[metricId]!, [field]: Number.isFinite(num) ? num : 0 } }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const r = await apiFetch(`/api/clients/${clientId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thresholds: values }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Failed to save')
      setClientSettings(clientId, data.settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm t2">
        Where the good/watch/bad status dots switch for this client. Defaults apply until customized here.
      </p>

      <div className="card divide-y divide-theme">
        {THRESHOLD_METRICS.map((m) => (
          <div key={m.id} className="p-4 flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm font-medium t1">{m.label}</p>
              <p className="text-[11px] t3">{m.higherIsBetter ? 'Higher is better' : 'Lower is better'}</p>
            </div>
            <label className="flex items-center gap-1.5 text-xs t2">
              Good
              <input
                type="number" step="any"
                value={values[m.id]?.good ?? ''}
                onChange={(e) => update(m.id, 'good', e.target.value)}
                className="w-24 px-2 py-1.5 text-xs t1 bg-surface-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs t2">
              Bad
              <input
                type="number" step="any"
                value={values[m.id]?.bad ?? ''}
                onChange={(e) => update(m.id, 'bad', e.target.value)}
                className="w-24 px-2 py-1.5 text-xs t1 bg-surface-2 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </label>
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">{error}</div>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save thresholds
        </button>
        {saved && <span className="text-xs text-emerald-500 font-medium">Saved</span>}
      </div>
    </div>
  )
}

function UsersTab({ clientId }: { clientId: string }) {
  const [users, setUsers] = useState<ClientUserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function load() {
    apiFetch(`/api/clients/${clientId}/users`)
      .then((r) => r.json())
      .then((data) => setUsers(data.users ?? []))
      .catch((e) => setError(e.message))
  }

  useEffect(() => { load() }, [clientId])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setAddError(null)
    try {
      const r = await apiFetch(`/api/clients/${clientId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Failed to create user')
      setName(''); setEmail(''); setPassword(''); setShowAdd(false)
      load()
    } catch (e: any) {
      setAddError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm t2">Logins scoped to this client only — they'll never see other clients' data.</p>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <UserPlus size={13} /> Add user
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="card p-4 border-dashed space-y-3">
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Full name" required
            className="w-full text-sm t1 bg-surface-2 border border-theme rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" required
            className="w-full text-sm t1 bg-surface-2 border border-theme rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)" required minLength={8}
            className="w-full text-sm t1 bg-surface-2 border border-theme rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <button
            type="submit" disabled={saving}
            className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Create login
          </button>
        </form>
      )}

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">{error}</div>}

      {users === null ? (
        <div className="flex items-center gap-2 text-sm t3 py-8 justify-center">
          <Loader2 size={14} className="animate-spin" /> Loading users…
        </div>
      ) : users.length === 0 ? (
        <div className="card p-6 text-center text-sm t3">No users yet for this client.</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="card p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium t1 truncate">{u.name}</p>
                <p className="text-xs t3 flex items-center gap-1 truncate"><Mail size={10} /> {u.email}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AdminClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { clients, setClientsFromServer } = useClientStore()
  const { setClientId } = useFilterStore()
  const [tab, setTab] = useState<'connections' | 'users' | 'settings'>('connections')
  const [loading, setLoading] = useState(true)

  const client = clients.find((c) => c.id === id)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    apiFetch('/api/clients')
      .then((r) => r.json())
      .then((data) => setClientsFromServer(data.clients ?? []))
      .then(() => Promise.all([syncMetaStatus(id), syncGoogleStatus(id), syncShopifyStatus(id)]))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!id) return null

  return (
    <div className="max-w-2xl space-y-6">
      <button
        onClick={() => navigate('/admin/clients')}
        className="flex items-center gap-1.5 text-xs font-medium t3 hover:t1 transition-colors"
      >
        <ArrowLeft size={13} /> All clients
      </button>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {client && (
            <span
              className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ backgroundColor: client.logoColor }}
            >
              {client.logoInitials}
            </span>
          )}
          <div>
            <h1 className="text-xl font-bold t1">{client?.name ?? 'Loading…'}</h1>
            {client?.industry && <p className="text-sm t3">{client.industry}</p>}
          </div>
        </div>
        <button
          onClick={() => { setClientId(id); navigate('/overview') }}
          className="flex items-center gap-1.5 text-xs font-semibold border border-theme t2 hover:t1 hover:bg-surface-2 px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          <ExternalLink size={13} /> View dashboard
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-theme">
        {(['connections', 'users', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
              tab === t ? 'border-indigo-500 text-indigo-500 dark:text-indigo-400' : 'border-transparent t3 hover:t1'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && !client ? (
        <div className="flex items-center gap-2 text-sm t3 py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading client…
        </div>
      ) : tab === 'connections' && client ? (
        <div className="card p-4">
          <ClientMetaSection client={client} />
          <ShopifyInstallLinkTool clientId={id} client={client} />
          <ClientShopifySection client={client} />
          <ClientGoogleSection client={client} />
        </div>
      ) : tab === 'users' ? (
        <UsersTab clientId={id} />
      ) : tab === 'settings' ? (
        <SettingsTab clientId={id} />
      ) : null}
    </div>
  )
}
