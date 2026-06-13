import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

export interface Client {
  id: string
  name: string
  industry: string
  logoInitials: string
  logoColor: string
  createdAt: string
  metaAdAccountId: string | null   // which of this client's enabled ad accounts to show
  meta: MetaConnection             // this client's own Meta connection
}

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899',
]

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('')
}

function pickColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

interface ClientStore {
  clients: Client[]
  addClient: (name: string, industry: string) => Client
  removeClient: (id: string) => void
  updateClient: (id: string, updates: Pick<Client, 'name' | 'industry'>) => void
  assignAdAccount: (clientId: string, adAccountId: string | null) => void
  setMetaConnected: (clientId: string, data: { metaUserId: string; adAccounts: AdAccount[]; expiresAt: string; accessToken?: string }) => void
  setMetaDisconnected: (clientId: string) => void
  setEnabledAdAccountIds: (clientId: string, ids: string[]) => void
  reopenAdAccountSelector: (clientId: string) => void
}

export const useClientStore = create<ClientStore>()(
  persist(
    (set, get) => ({
      clients: [],

      addClient: (name, industry) => {
        const client: Client = {
          id: `client_${Date.now()}`,
          name: name.trim(),
          industry: industry.trim() || 'Other',
          logoInitials: initials(name),
          logoColor: pickColor(name),
          createdAt: new Date().toISOString(),
          metaAdAccountId: null,
          meta: { ...EMPTY_META },
        }
        set({ clients: [...get().clients, client] })
        return client
      },

      removeClient: (id) =>
        set({ clients: get().clients.filter((c) => c.id !== id) }),

      updateClient: (id, updates) =>
        set({
          clients: get().clients.map((c) =>
            c.id === id
              ? { ...c, ...updates, logoInitials: initials(updates.name), logoColor: pickColor(updates.name) }
              : c
          ),
        }),

      assignAdAccount: (clientId, adAccountId) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId ? { ...c, metaAdAccountId: adAccountId } : c
          ),
        }),

      setMetaConnected: (clientId, { metaUserId, adAccounts, expiresAt, accessToken }) =>
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
        }),

      setMetaDisconnected: (clientId) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId ? { ...c, metaAdAccountId: null, meta: { ...EMPTY_META } } : c
          ),
        }),

      setEnabledAdAccountIds: (clientId, ids) =>
        set({
          clients: get().clients.map((c) => {
            if (c.id !== clientId) return c
            const metaAdAccountId =
              c.metaAdAccountId && ids.includes(c.metaAdAccountId)
                ? c.metaAdAccountId
                : ids[0] ?? null
            return { ...c, metaAdAccountId, meta: { ...c.meta, enabledAdAccountIds: ids } }
          }),
        }),

      reopenAdAccountSelector: (clientId) =>
        set({
          clients: get().clients.map((c) =>
            c.id === clientId ? { ...c, meta: { ...c.meta, enabledAdAccountIds: null } } : c
          ),
        }),
    }),
    {
      name: 'marktech-clients',
      version: 1,
      migrate: (persisted: any) => {
        if (!persisted?.clients) return persisted
        return {
          ...persisted,
          clients: persisted.clients.map((c: any) => ({
            ...c,
            metaAdAccountId: c.metaAdAccountId ?? null,
            meta: c.meta ?? { ...EMPTY_META },
          })),
        }
      },
    }
  )
)
