import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiFetch } from '@/lib/api'

// metaAdAccountId changes here were previously local-only (persisted to this
// browser's localStorage but never sent to the server) — the backend's own
// meta_tokens.selected_ad_account_id column stayed null forever unless this
// was called, which nothing did. Confirmed live: Overview (which reads that
// column directly, unlike the ad-driven pages which read this store) treated
// a real, working Meta connection as fully disconnected for its Meta ROAS
// calculation as a result. Fire-and-forget — a failed sync here shouldn't
// block the UI, and the next successful call corrects it.
function syncSelectedAdAccount(clientId: string, adAccountId: string | null) {
  if (!adAccountId) return
  apiFetch('/auth/meta/select-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, adAccountId }),
  }).catch(() => {})
}

export interface AdAccount {
  id: string
  name: string
  currency: string
  business?: { id: string; name: string } | null
}

export interface MetaConnection {
  connected: boolean
  metaUserId: string | null
  accessToken: string | null
  adAccounts: AdAccount[]
  // null = not yet chosen (show the selection screen); [] / [...] = saved choice
  enabledAdAccountIds: string[] | null
  expiresAt: string | null
}

const EMPTY_META: MetaConnection = {
  connected: false,
  metaUserId: null,
  accessToken: null,
  adAccounts: [],
  enabledAdAccountIds: null,
  expiresAt: null,
}

export interface ShopifyConnection {
  connected: boolean
  shopDomain: string | null
  shopName: string | null
}

const EMPTY_SHOPIFY: ShopifyConnection = {
  connected: false,
  shopDomain: null,
  shopName: null,
}

export interface GoogleCustomer {
  id: string
  name: string
  descriptiveName: string
  currencyCode: string
  isManager: boolean
}

export interface GoogleConnection {
  connected: boolean
  customerId: string | null     // selected Google Ads customer ID
  customerName: string | null
  customers: GoogleCustomer[]
  // A saved connection that stopped working (revoked/expired refresh token) —
  // shown as "sync interrupted" with NA values, never as demo data.
  syncError?: boolean
}

const EMPTY_GOOGLE: GoogleConnection = {
  connected: false,
  customerId: null,
  customerName: null,
  customers: [],
  syncError: false,
}

export interface ThresholdSetting { good: number; bad: number }
export interface ClientSettings {
  thresholds?: Record<string, ThresholdSetting>
  // The client's own Shopify app, so their store can be onboarded via its
  // own distributable install link instead of sharing one global app across
  // every client. clientSecret is write-only — the server redacts it on every
  // read, so it's never present here once saved.
  shopifyApp?: { clientId: string; configured: boolean }
}

export interface Client {
  id: string
  name: string
  industry: string
  logoInitials: string
  logoColor: string
  createdAt: string
  metaAdAccountId: string | null   // which of this client's enabled ad accounts to show
  meta: MetaConnection             // this client's own Meta connection
  shopify: ShopifyConnection       // this client's Shopify store connection
  google: GoogleConnection         // this client's Google Ads connection
  settings: ClientSettings
}


export interface ServerClient {
  id: string
  name: string
  industry: string
  logoInitials: string
  logoColor: string
  settings: ClientSettings
}

interface ClientStore {
  clients: Client[]
  // Replaces the client list with the server's scoped, authoritative answer
  // (admin: every client; client_user: just their own) — preserves each
  // client's already-known connection sub-state, since that isn't part of
  // this payload. Any local client absent from the server list is dropped.
  setClientsFromServer: (serverClients: ServerClient[]) => void
  createClient: (name: string, industry: string) => Promise<Client>
  setClientSettings: (clientId: string, settings: ClientSettings) => void
  assignAdAccount: (clientId: string, adAccountId: string | null) => void
  setMetaConnected: (clientId: string, data: { metaUserId: string; adAccounts: AdAccount[]; expiresAt: string; accessToken?: string }) => void
  setMetaDisconnected: (clientId: string) => void
  setEnabledAdAccountIds: (clientId: string, ids: string[]) => void
  reopenAdAccountSelector: (clientId: string) => void
  setShopifyConnected: (clientId: string, data: { shopDomain: string; shopName: string }) => void
  setShopifyDisconnected: (clientId: string) => void
  setGoogleConnected: (clientId: string, data: { customerId: string | null; customerName: string | null; customers: GoogleCustomer[] }) => void
  setGoogleDisconnected: (clientId: string) => void
  setGoogleSyncError: (clientId: string) => void
}

export const useClientStore = create<ClientStore>()(
  persist(
    (set, get) => ({
      clients: [],

      setClientsFromServer: (serverClients) => {
        const existing = get().clients
        set({
          clients: serverClients.map((sc) => {
            const local = existing.find((c) => c.id === sc.id)
            return {
              id: sc.id,
              name: sc.name,
              industry: sc.industry,
              logoInitials: sc.logoInitials,
              logoColor: sc.logoColor,
              createdAt: local?.createdAt ?? new Date().toISOString(),
              metaAdAccountId: local?.metaAdAccountId ?? null,
              meta: local?.meta ?? { ...EMPTY_META },
              shopify: local?.shopify ?? { ...EMPTY_SHOPIFY },
              google: local?.google ?? { ...EMPTY_GOOGLE },
              settings: sc.settings ?? {},
            }
          }),
        })
      },

      createClient: async (name, industry) => {
        const res = await apiFetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, industry }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        const client: Client = {
          id: data.id, name: data.name, industry: data.industry || 'Other',
          logoInitials: data.logoInitials, logoColor: data.logoColor,
          createdAt: new Date().toISOString(), metaAdAccountId: null,
          meta: { ...EMPTY_META }, shopify: { ...EMPTY_SHOPIFY }, google: { ...EMPTY_GOOGLE },
          settings: {},
        }
        set({ clients: [...get().clients, client] })
        return client
      },

      setClientSettings: (clientId, settings) =>
        set({
          clients: get().clients.map((c) => (c.id === clientId ? { ...c, settings } : c)),
        }),

      assignAdAccount: (clientId, adAccountId) => {
        set({
          clients: get().clients.map((c) =>
            c.id === clientId ? { ...c, metaAdAccountId: adAccountId } : c
          ),
        })
        syncSelectedAdAccount(clientId, adAccountId)
      },

      setMetaConnected: (clientId, { metaUserId, adAccounts, expiresAt, accessToken }) => {
        let autoPickedAdAccountId: string | null = null
        set({
          clients: get().clients.map((c) => {
            if (c.id !== clientId) return c

            // Different Meta user reconnecting (or first-ever connect) → make
            // them choose again. Same user refreshing → keep their saved
            // choice, but drop any ids for accounts they no longer have access to.
            const sameUser = c.meta.metaUserId === metaUserId
            const enabledAdAccountIds =
              sameUser && c.meta.enabledAdAccountIds !== null
                ? c.meta.enabledAdAccountIds.filter((id) => adAccounts.some((a) => a.id === id))
                : null

            // Auto-pick the ad account to display if there's exactly one enabled
            let metaAdAccountId = c.metaAdAccountId
            if (enabledAdAccountIds && (!metaAdAccountId || !enabledAdAccountIds.includes(metaAdAccountId))) {
              metaAdAccountId = enabledAdAccountIds.length === 1 ? enabledAdAccountIds[0] : null
              autoPickedAdAccountId = metaAdAccountId
            }

            return {
              ...c,
              metaAdAccountId,
              meta: {
                connected: true,
                metaUserId,
                adAccounts,
                expiresAt,
                accessToken: accessToken ?? c.meta.accessToken,
                enabledAdAccountIds,
              },
            }
          }),
        })
        syncSelectedAdAccount(clientId, autoPickedAdAccountId)
      },

      setMetaDisconnected: (clientId) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId ? { ...c, metaAdAccountId: null, meta: { ...EMPTY_META } } : c
          ),
        }),

      setEnabledAdAccountIds: (clientId, ids) => {
        let pickedAdAccountId: string | null = null
        set({
          clients: get().clients.map((c) => {
            if (c.id !== clientId) return c
            const metaAdAccountId =
              c.metaAdAccountId && ids.includes(c.metaAdAccountId)
                ? c.metaAdAccountId
                : ids[0] ?? null
            pickedAdAccountId = metaAdAccountId
            return { ...c, metaAdAccountId, meta: { ...c.meta, enabledAdAccountIds: ids } }
          }),
        })
        syncSelectedAdAccount(clientId, pickedAdAccountId)
      },

      reopenAdAccountSelector: (clientId) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId ? { ...c, meta: { ...c.meta, enabledAdAccountIds: null } } : c
          ),
        }),

      setShopifyConnected: (clientId, { shopDomain, shopName }) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId
              ? { ...c, shopify: { connected: true, shopDomain, shopName } }
              : c
          ),
        }),

      setShopifyDisconnected: (clientId) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId ? { ...c, shopify: { ...EMPTY_SHOPIFY } } : c
          ),
        }),

      setGoogleConnected: (clientId, { customerId, customerName, customers }) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId
              ? { ...c, google: { connected: true, customerId, customerName, customers, syncError: false } }
              : c
          ),
        }),

      setGoogleDisconnected: (clientId) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId ? { ...c, google: { ...EMPTY_GOOGLE } } : c
          ),
        }),

      setGoogleSyncError: (clientId) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId ? { ...c, google: { ...EMPTY_GOOGLE, customerId: c.google.customerId, customerName: c.google.customerName, syncError: true } } : c
          ),
        }),

    }),
    {
      name: 'marktech-clients',
      version: 4,
      migrate: (persisted: any) => {
        if (!persisted?.clients) return persisted
        return {
          ...persisted,
          clients: persisted.clients.map((c: any) => ({
            ...c,
            metaAdAccountId: c.metaAdAccountId ?? null,
            meta: c.meta ?? { ...EMPTY_META },
            shopify: c.shopify ?? { ...EMPTY_SHOPIFY },
            google: c.google ?? { ...EMPTY_GOOGLE },
            settings: c.settings ?? {},
          })),
        }
      },
    }
  )
)
