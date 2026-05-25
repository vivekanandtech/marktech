import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { MetaAdsPage } from '@/pages/MetaAdsPage'
import { GoogleAdsPage } from '@/pages/GoogleAdsPage'
import { CreativesPage } from '@/pages/CreativesPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { useAuthStore } from '@/store/authStore'
import { useMetaStore } from '@/store/metaStore'
import { useFilterStore } from '@/store/filterStore'
import { initTheme } from '@/store/themeStore'

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export function syncMetaStatus(clientId: string) {
  const { setConnected, setDisconnected } = useMetaStore.getState()
  return fetch(`${API}/auth/meta/status?clientId=${clientId}`)
    .then((r) => r.json())
    .then((data) => {
      if (data.connected) {
        setConnected({ metaUserId: data.metaUserId, adAccounts: data.adAccounts, expiresAt: data.expiresAt })
      } else {
        setDisconnected()
      }
    })
    .catch(() => setDisconnected())
}

function MetaSyncProvider() {
  const { clientId } = useFilterStore()

  useEffect(() => {
    syncMetaStatus(clientId)
  }, [clientId])

  return null
}

export default function App() {
  useEffect(() => { initTheme() }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
