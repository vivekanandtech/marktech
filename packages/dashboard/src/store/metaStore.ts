import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AdAccount {
  id: string
  name: string
  currency: string
  business?: { id: string; name: string } | null
}

interface MetaState {
  connected: boolean
  metaUserId: string | null
  adAccounts: AdAccount[]
  selectedAdAccountId: string | null
  // null = not yet chosen (show the selection screen); [] / [...] = user's saved choice
  enabledAdAccountIds: string[] | null
  expiresAt: string | null
  accessToken: string | null
  setConnected: (data: { metaUserId: string; adAccounts: AdAccount[]; expiresAt: string; accessToken?: string }) => void
  setDisconnected: () => void
  selectAdAccount: (id: string) => void
  setEnabledAdAccountIds: (ids: string[]) => void
  reopenAdAccountSelector: () => void
}

export const useMetaStore = create<MetaState>()(
  persist(
    (set) => ({
      connected: false,
      metaUserId: null,
      adAccounts: [],
      selectedAdAccountId: null,
      enabledAdAccountIds: null,
      expiresAt: null,
      accessToken: null,
      setConnected: ({ metaUserId, adAccounts, expiresAt, accessToken }) =>
        set((s) => {
          // Different Meta user reconnecting (or first-ever connect) → make them
          // choose again. Same user refreshing → keep their saved choice, but
          // drop any ids for accounts they no longer have access to.
          const sameUser = s.metaUserId === metaUserId
          const enabledAdAccountIds =
            sameUser && s.enabledAdAccountIds !== null
              ? s.enabledAdAccountIds.filter((id) => adAccounts.some((a) => a.id === id))
              : null

          return {
            connected: true,
            metaUserId,
            adAccounts,
            expiresAt,
            accessToken: accessToken ?? s.accessToken,
            selectedAdAccountId: adAccounts[0]?.id ?? null,
            enabledAdAccountIds,
          }
        }),
      setDisconnected: () =>
        set({ connected: false, metaUserId: null, adAccounts: [], selectedAdAccountId: null, enabledAdAccountIds: null, expiresAt: null, accessToken: null }),
      selectAdAccount: (id) => set({ selectedAdAccountId: id }),
      setEnabledAdAccountIds: (ids) => set({ enabledAdAccountIds: ids }),
      reopenAdAccountSelector: () => set({ enabledAdAccountIds: null }),
    }),
    { name: 'marktech-meta' }
  )
)
