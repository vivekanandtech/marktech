import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicyPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { MetaAdsPage } from '@/pages/MetaAdsPage'
import { GoogleAdsPage } from '@/pages/GoogleAdsPage'
import { CreativesPage } from '@/pages/CreativesPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { useAuthStore } from '@/store/authStore'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { initTheme } from '@/store/themeStore'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export function syncMetaStatus(clientId: string) {
  const { setMetaConnected, setMetaDisconnected } = useClientStore.getState()
  return fetch(`${API}/auth/meta/status?clientId=${clientId}`)
    .then((r) => r.json())
    .then((data) => {
      if (data.connected) {
        setMetaConnected(clientId, {
          metaUserId: data.metaUserId,
          adAccounts: data.adAccounts,
          expiresAt: data.expiresAt,
        })
      } else {
        setMetaDisconnected(clientId)
      }
    })
    .catch(() => setMetaDisconnected(clientId))
}

function MetaSyncProvider() {
  const { clientId, setClientId } = useFilterStore()
  const { clients, adoptSession } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const connected = currentClient?.meta.connected ?? false
  const accessToken = currentClient?.meta.accessToken ?? null
  const metaAdAccountId = currentClient?.metaAdAccountId ?? null
  const prevAdAccountId = useRef<string | null>(null)

  // On mount: discover active Meta sessions from server and adopt them locally.
  // Runs unconditionally (no localStorage guard) so stale/disconnected demo
  // clients on Machine B don't block real session data from the DB.
  // After adoption, forces filterStore.clientId to the connected client.
  useEffect(() => {
    fetch(`${API}/auth/meta/sessions`)
      .then((r) => r.json())
      .then(({ sessions }) => {
        if (!sessions?.length) return
        const { adoptSession: adopt } = useClientStore.getState()
        sessions.forEach((s: any) => adopt({
          clientId: s.clientId,
          metaUserId: s.metaUserId,
          adAccounts: s.adAccounts,
          selectedAdAccountId: s.selectedAdAccountId,
          expiresAt: new Date(s.expiresAt).toISOString(),
        }))
        // After adoption, make sure filterStore points to a connected client.
        // Machine B may have a stale clientId (e.g. 'c1' demo) in localStorage
        // that doesn't match the newly adopted real client — override it.
        const { clients: updated } = useClientStore.getState()
        const { clientId: currentId, setClientId: setId } = useFilterStore.getState()
        const currentIsConnected = updated.find(c => c.id === currentId)?.meta.connected
        if (!currentIsConnected) {
          const firstConnected = updated.find(c => c.meta.connected)
          if (firstConnected) setId(firstConnected.id)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // once on mount — reads store via getState() to avoid stale closure

  // Auto-select first client if the stored clientId no longer exists in the list
  useEffect(() => {
    if (clients.length === 0) return
    const valid = clients.find((c) => c.id === clientId)
    if (!valid) {
      const preferred = clients.find(c => c.meta.connected) ?? clients[0]
      setClientId(preferred.id)
    }
  }, [clients, clientId, setClientId])

  // Fall back to /auth/meta/status if not connected locally
  useEffect(() => {
    if (!connected && !accessToken && clientId) {
      syncMetaStatus(clientId)
    }
  }, [clientId, connected, accessToken])

  // Persist ad account selection to DB so other browsers pick it up
  useEffect(() => {
    if (!clientId || !metaAdAccountId) return
    if (metaAdAccountId === prevAdAccountId.current) return
    prevAdAccountId.current = metaAdAccountId
    fetch(`${API}/auth/meta/select-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, adAccountId: metaAdAccountId }),
    }).catch(() => {})
  }, [clientId, metaAdAccountId])

  return null
}

export default function App() {
  useEffect(() => { initTheme() }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MetaSyncProvider />
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="meta" element={<MetaAdsPage />} />
          <Route path="google" element={<GoogleAdsPage />} />
          <Route path="creatives" element={<CreativesPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
