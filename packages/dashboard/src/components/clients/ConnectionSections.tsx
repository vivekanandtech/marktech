import { useState } from 'react'
import {
  Loader2, Link2, Unlink, Check, ChevronDown, ShoppingBag,
} from 'lucide-react'
import { useClientStore, type Client } from '@/store/clientStore'
import { apiFetch } from '@/lib/api'

// ─── Ad account selection screen ───────────────────────────────────────────────
// Shown right after a client connects (or when they click "Edit accounts").
// Nothing left unchecked is ever stored, fetched, or shown elsewhere.
function AdAccountSelector({ client }: { client: Client }) {
  const { setEnabledAdAccountIds } = useClientStore()
  const adAccounts = client.meta.adAccounts
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

  // Group by Business Portfolio so it's clear which business each account belongs to
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
          <div key={key} className="rounded-lg border border-theme bg-surface-3 overflow-hidden">
            <p className="text-[11px] font-semibold uppercase tracking-wide t3 px-3 py-2 bg-surface-2 border-b border-theme">
              {group.label}
            </p>
            <div className="divide-y divide-theme">
              {group.accounts.map((acc) => (
                <label
                  key={acc.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-2 transition-colors"
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
                  <span className="text-[11px] font-medium bg-surface-2 border border-theme px-2 py-0.5 rounded-md t2">
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
          onClick={() => setEnabledAdAccountIds(client.id, [...selected])}
          disabled={selected.size === 0}
          className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Confirm selection ({selected.size})
        </button>
      </div>
    </div>
  )
}

// ─── Per-client Meta connection ────────────────────────────────────────────────
// canManage gates connect/disconnect/edit-accounts — the Meta OAuth flow
// lists every ad account the connecting login can see, which under this
// agency's shared Business Manager identity means every client's account
// becomes visible to whoever completes it. Admin panel passes true; the
// client-facing Settings page passes false so clients only ever see their
// own already-assigned account, read-only.
export function ClientMetaSection({ client, canManage = true }: { client: Client; canManage?: boolean }) {
  const { setMetaDisconnected, reopenAdAccountSelector, assignAdAccount } = useClientStore()
  const [disconnecting, setDisconnecting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const { connected, adAccounts, enabledAdAccountIds, expiresAt } = client.meta

  async function connect() {
    setConnecting(true)
    setConnectError(null)
    try {
      const r = await apiFetch(`/auth/meta?clientId=${client.id}`)
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Failed to start Meta connect')
      window.location.href = data.url
    } catch (e: any) {
      setConnectError(e.message)
      setConnecting(false)
    }
  }

  async function disconnect() {
    setDisconnecting(true)
    try {
      await apiFetch(`/auth/meta/disconnect?clientId=${client.id}`, { method: 'DELETE' })
      setMetaDisconnected(client.id)
    } finally {
      setDisconnecting(false)
    }
  }

  if (!connected) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed border-theme px-3 py-2.5">
        <p className="text-xs t3">
          {canManage
            ? "Connect this client's own Meta account to pull their live campaign data."
            : 'Meta Ads is not connected yet — contact your account manager to set this up.'}
        </p>
        {canManage && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              onClick={connect}
              disabled={connecting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
            >
              {connecting ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
              Connect Meta Ads
            </button>
            {connectError && <p className="text-[11px] text-red-500">{connectError}</p>}
          </div>
        )}
      </div>
    )
  }

  if (enabledAdAccountIds === null) {
    if (!canManage) {
      return (
        <div className="mt-3 rounded-lg border border-dashed border-theme px-3 py-2.5">
          <p className="text-xs t3">Meta is connected — your account manager is finishing setup.</p>
        </div>
      )
    }
    return (
      <div className="mt-3 rounded-lg border border-theme bg-surface-2 p-3">
        <AdAccountSelector client={client} />
      </div>
    )
  }

  const enabledAccounts = adAccounts.filter((acc) => enabledAdAccountIds.includes(acc.id))

  return (
    <div className="mt-3 space-y-2.5 rounded-lg border border-theme bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Meta connected</span>
          <span className="text-xs t3">· {enabledAccounts.length} of {adAccounts.length} enabled</span>
        </div>
        {canManage && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => reopenAdAccountSelector(client.id)}
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
        )}
      </div>

      {enabledAccounts.length > 1 ? (
        <div className="relative">
          <select
            value={client.metaAdAccountId ?? ''}
            onChange={(e) => assignAdAccount(client.id, e.target.value || null)}
            className="w-full appearance-none text-xs t1 bg-surface-3 border border-theme rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
          >
            <option value="">— Select ad account to show —</option>
            {enabledAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 t3 pointer-events-none" />
        </div>
      ) : enabledAccounts.length === 1 ? (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-3 border border-theme">
          <div>
            <p className="text-xs font-medium t1">{enabledAccounts[0].name}</p>
            <p className="text-[11px] t3">{enabledAccounts[0].id}</p>
          </div>
          <span className="text-[11px] font-medium bg-surface-2 border border-theme px-2 py-0.5 rounded-md t2">{enabledAccounts[0].currency}</span>
        </div>
      ) : (
        <p className="text-xs t3">
          {canManage ? 'No ad accounts enabled — click "Edit accounts" to choose one.' : 'No ad account enabled yet — contact your account manager.'}
        </p>
      )}

      <p className="text-[11px] t3">
        Expires {expiresAt ? new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
      </p>
    </div>
  )
}

// ─── Per-client Shopify connection ────────────────────────────────────────────
// Uses Shopify Custom App Admin API tokens (shpat_...) — no OAuth needed.
export function ClientShopifySection({ client }: { client: Client }) {
  const { setShopifyConnected, setShopifyDisconnected } = useClientStore()
  const [shop, setShop] = useState('')
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const { connected, shopDomain, shopName } = client.shopify ?? { connected: false, shopDomain: null, shopName: null }

  async function connect() {
    if (!shop.trim() || !token.trim()) return
    setConnecting(true)
    setConnectError(null)
    try {
      const r = await apiFetch('/auth/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, shopDomain: shop.trim(), accessToken: token.trim() }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Connection failed')
      setShopifyConnected(client.id, { shopDomain: data.shopDomain, shopName: data.shopName })
      setShop('')
      setToken('')
    } catch (e: any) {
      setConnectError(e.message)
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect() {
    setDisconnecting(true)
    try {
      await apiFetch(`/auth/shopify/disconnect?clientId=${client.id}`, { method: 'DELETE' })
      setShopifyDisconnected(client.id)
    } finally {
      setDisconnecting(false)
    }
  }

  if (!connected) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-theme p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <ShoppingBag size={12} className="text-emerald-500" />
          <p className="text-xs font-semibold t2">Connect Shopify store</p>
        </div>

        <div className="flex items-center rounded-lg border border-theme overflow-hidden bg-surface-3 focus-within:ring-2 focus-within:ring-emerald-500/30">
          <span className="px-2 text-[11px] t3 shrink-0 border-r border-theme py-2">https://</span>
          <input
            type="text"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="dohar-india"
            className="flex-1 px-2 py-2 text-xs t1 bg-transparent focus:outline-none min-w-0"
          />
          <span className="px-2 text-[11px] t3 shrink-0 border-l border-theme py-2">.myshopify.com</span>
        </div>

        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && connect()}
          placeholder="Admin API access token  (shpat_...)"
          className="w-full px-2 py-2 text-xs t1 bg-surface-3 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />

        {connectError && (
          <p className="text-[11px] text-red-500">{connectError}</p>
        )}

        <button
          onClick={connect}
          disabled={!shop.trim() || !token.trim() || connecting}
          className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          {connecting ? <Loader2 size={12} className="animate-spin" /> : <ShoppingBag size={12} />}
          Connect Shopify
        </button>

        <p className="text-[11px] t3 leading-relaxed">
          Get the token from: Store Admin → Settings → Apps → Develop apps → your app → <strong>API credentials</strong> → Install app
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-theme bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Shopify connected</span>
        <span className="text-xs t3">· {shopName ?? shopDomain}</span>
      </div>
      <button
        onClick={disconnect}
        disabled={disconnecting}
        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
      >
        {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
        Disconnect
      </button>
    </div>
  )
}

// ─── Per-client Google Ads connection ─────────────────────────────────────────
export function ClientGoogleSection({ client }: { client: Client }) {
  const { setGoogleConnected, setGoogleDisconnected } = useClientStore()
  const [disconnecting, setDisconnecting] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const google = client.google ?? { connected: false, customerName: null, customerId: null, customers: [] }

  async function connect() {
    setConnecting(true)
    setConnectError(null)
    try {
      const r = await apiFetch(`/auth/google?clientId=${client.id}`)
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Failed to start Google connect')
      window.location.href = data.url
    } catch (e: any) {
      setConnectError(e.message)
      setConnecting(false)
    }
  }

  async function disconnect() {
    setDisconnecting(true)
    try {
      await apiFetch(`/auth/google/disconnect?clientId=${client.id}`, { method: 'DELETE' })
      setGoogleDisconnected(client.id)
    } finally {
      setDisconnecting(false)
    }
  }

  async function saveCustomer() {
    const id = customerId.replace(/-/g, '').trim()
    if (!id) return
    setSaving(true)
    setSaveError(null)
    try {
      const r = await apiFetch('/auth/google/select-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, customerId: id, customerName: customerName.trim() || id }),
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error ?? 'Failed to save')
      setGoogleConnected(client.id, { customerId: id, customerName: customerName.trim() || id, customers: [] })
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!google.connected) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-theme p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <p className="text-xs font-semibold t2">Connect Google Ads</p>
          </div>
          <button
            onClick={connect}
            disabled={connecting}
            className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
            Connect
          </button>
        </div>
        {connectError && <p className="text-[11px] text-red-500">{connectError}</p>}
      </div>
    )
  }

  if (!google.customerId) {
    return (
      <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2.5">
        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">Google authorised — enter your Customer ID</p>
        <p className="text-[11px] t3 leading-relaxed">
          Find it in Google Ads top-right account switcher (e.g. <span className="font-mono">846-837-3306</span>). Dashes are optional.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveCustomer()}
            placeholder="e.g. 846-837-3306"
            className="flex-1 px-2 py-1.5 text-xs t1 bg-surface-3 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"
          />
          <button
            onClick={saveCustomer}
            disabled={!customerId.trim() || saving}
            className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Save
          </button>
        </div>
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Account name (optional, e.g. Sheetal Batra)"
          className="w-full px-2 py-1.5 text-xs t1 bg-surface-3 border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        {saveError && <p className="text-[11px] text-red-500">{saveError}</p>}
        <button onClick={disconnect} className="text-[11px] text-red-400 hover:text-red-500 transition-colors">
          Disconnect and start over
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-theme bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 shrink-0">Google Ads connected</span>
        <span className="text-xs t3 truncate">· {google.customerName ?? google.customerId}</span>
      </div>
      <button
        onClick={disconnect}
        disabled={disconnecting}
        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-50 shrink-0"
      >
        {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
        Disconnect
      </button>
    </div>
  )
}
