import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage } from '@/pages/LoginPage'
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicyPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { MetaAdsPage } from '@/pages/MetaAdsPage'
import { GoogleAdsPage } from '@/pages/GoogleAdsPage'
import { ShopifyPage } from '@/pages/ShopifyPage'
import { InsightsPage } from '@/pages/InsightsPage'
import { CreativesPage } from '@/pages/CreativesPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AdminClientsPage } from '@/pages/admin/AdminClientsPage'
import { AdminClientDetailPage } from '@/pages/admin/AdminClientDetailPage'
import { useAuthStore } from '@/store/authStore'
import { useFilterStore } from '@/store/filterStore'
import { useClientStore } from '@/store/clientStore'
import { initTheme } from '@/store/themeStore'
import { apiFetch } from '@/lib/api'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role)
  return role === 'admin' ? <>{children}</> : <Navigate to="/overview" replace />
}

export function syncMetaStatus(clientId: string) {
  const { setMetaConnected, setMetaDisconnected, assignAdAccount } = useClientStore.getState()
  return apiFetch(`/auth/meta/status?clientId=${clientId}`)
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (!data) return  // server error (5xx) or forbidden — don't touch connection state
      if (data.connected) {
        setMetaConnected(clientId, {
          metaUserId: data.metaUserId,
          adAccounts: data.adAccounts,
          expiresAt: data.expiresAt,
          accessToken: data.accessToken,
        })
        if (data.selectedAdAccountId) {
          const client = useClientStore.getState().clients.find((c) => c.id === clientId)
          if (!client?.metaAdAccountId) assignAdAccount(clientId, data.selectedAdAccountId)
        }
      } else {
        setMetaDisconnected(clientId)
      }
    })
    .catch(() => {})
}

export function syncGoogleStatus(clientId: string) {
  const { setGoogleConnected, setGoogleDisconnected } = useClientStore.getState()
  return apiFetch(`/auth/google/status?clientId=${clientId}`)
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (!data) return
      if (data.connected && data.customerId) {
        setGoogleConnected(clientId, { customerId: data.customerId, customerName: data.customerName, customers: data.customers ?? [] })
      } else if (!data.connected) {
        setGoogleDisconnected(clientId)
      }
      // connected but no customerId yet — leave as-is; ClientGoogleSection's
      // manual-entry form is what's showing in that state.
    })
    .catch(() => {})
}

export function syncShopifyStatus(clientId: string) {
  const { setShopifyConnected, setShopifyDisconnected } = useClientStore.getState()
  return apiFetch(`/auth/shopify/status?clientId=${clientId}`)
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (!data) return
      if (data.connected) {
        setShopifyConnected(clientId, { shopDomain: data.shopDomain, shopName: data.shopName })
      } else {
        setShopifyDisconnected(clientId)
      }
    })
    .catch(() => {})
}

// Loads the authoritative, role-scoped client list for this login and keeps
// the current client's live connection status in sync with the server.
// Replaces the old approach of dumping every client's session to any caller
// on mount (see Phase 2 — that endpoint is now admin-only and going away).
function ClientSyncProvider() {
  const { clientId, setClientId } = useFilterStore()
  const { clients, setClientsFromServer } = useClientStore()

  useEffect(() => {
    apiFetch('/api/clients')
      .then((r) => r.json())
      .then((data) => setClientsFromServer(data.clients ?? []))
      .catch((err) => console.warn('[Marktech] client list fetch failed:', err))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Default to the first available client once the list loads, if none picked yet
  useEffect(() => {
    if (clients.length === 0) return
    if (!clients.find((c) => c.id === clientId)) setClientId(clients[0].id)
  }, [clients, clientId, setClientId])

  // Server is the source of truth for connection status, not whatever this
  // browser happened to cache before — re-check whenever the client changes.
  useEffect(() => {
    if (!clientId) return
    syncMetaStatus(clientId)
    syncGoogleStatus(clientId)
    syncShopifyStatus(clientId)
  }, [clientId])

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
              <ClientSyncProvider />
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="meta" element={<MetaAdsPage />} />
          <Route path="google" element={<GoogleAdsPage />} />
          <Route path="shopify" element={<ShopifyPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="creatives" element={<CreativesPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/clients" replace />} />
          <Route path="clients" element={<AdminClientsPage />} />
          <Route path="clients/:id" element={<AdminClientDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
