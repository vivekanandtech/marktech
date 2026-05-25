import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AdAccount {
  id: string
  name: string
  currency: string
}

interface MetaState {
  connected: boolean
  metaUserId: string | null
  adAccounts: AdAccount[]
  selectedAdAccountId: string | null
  expiresAt: string | null
  setConnected: (data: { metaUserId: string; adAccounts: AdAccount[]; expiresAt: string }) => void
  setDisconnected: () => void
  selectAdAccount: (id: string) => void
}

export const useMetaStore = create<MetaState>()(
  persist(
    (set) => ({
      connected: false,
      metaUserId: null,
      adAccounts: [],
      selectedAdAccountId: null,
      expiresAt: null,
      setConnected: ({ metaUserId, adAccounts, expiresAt }) =>
        set({
          connected: true,
          metaUserId,
          adAccounts,
          expiresAt,
          selectedAdAccountId: adAccounts[0]?.id ?? null,
        }),
      setDisconnected: () =>
        set({ connected: false, metaUserId: null, adAccounts: [], selectedAdAccountId: null, expiresAt: null }),
      selectAdAccount: (id) => set({ selectedAdAccountId: id }),
    }),
    { name: 'marktech-meta' }
  )
)
