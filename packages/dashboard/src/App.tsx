import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { MetaAdsPage } from '@/pages/MetaAdsPage'
import { GoogleAdsPage } from '@/pages/GoogleAdsPage'
import { CreativesPage } from '@/pages/CreativesPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { useAuthStore } from '@/store/authStore'
import { initTheme } from '@/store/themeStore'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
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
        </Route>
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
