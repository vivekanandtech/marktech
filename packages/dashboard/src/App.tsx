import { useEffect } from 'react'
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
        setMetaConnected(clientId, { metaUserId: data.metaUserId, adAccounts: data.adAccounts, expiresAt: data.expiresAt })
      } else {
        setMetaDisconnected(clientId)
      }
    })
    .catch(() => setMetaDisconnected(clientId))
}

function MetaSyncProvider() {
  const { clientId, setClientId } = useFilterStore()
  const { clients } = useClientStore()
  const currentClient = clients.find((c) => c.id === clientId)
  const connected = currentClient?.meta.connected ?? false
  const accessToken = currentClient?.meta.accessToken ?? null

  // Auto-select first client if none selected or stored id no longer exists
  useEffect(() => {
    if (clients.length === 0) return
    const valid = clients.find((c) => c.id === clientId)
    if (!valid) setClientId(clients[0].id)
  }, [clients, clientId, setClientId])

  // Each client's Meta access token lives in browser localStorage (stateless
  // backend). Only fall back to /auth/meta/status when we have no local
  // connection for this client — the server's in-memory tokenStore gets
  // wiped on every Render restart, so trusting it over a valid local
  // connection would wrongly disconnect us.
  useEffect(() => {
    if (!connected && !accessToken && clientId) {
      syncMetaStatus(clientId)
    }
  }, [clientId, connected, accessToken])

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
