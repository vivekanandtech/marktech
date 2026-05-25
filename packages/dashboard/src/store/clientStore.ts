import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Client {
  id: string
  name: string
  industry: string
  logoInitials: string
  logoColor: string
  createdAt: string
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
    }),
    { name: 'marktech-clients' }
  )
)
