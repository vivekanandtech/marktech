import { useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle } from 'lucide-react'
import { useClientStore } from '@/store/clientStore'
import { useAuthStore } from '@/store/authStore'
import { useFilterStore } from '@/store/filterStore'
import { syncMetaStatus, syncGoogleStatus } from '@/App'
import { ClientMetaSection, ClientShopifySection, ClientGoogleSection } from '@/components/clients/ConnectionSections'

// Client-facing only — creating clients and assigning logins now happens from
// the admin panel (/admin/clients). This page is where a client_user views
// and manages their own account's Meta/Shopify/Google connections.
export function SettingsPage() {
  const { clients } = useClientStore()
  const user = useAuthStore((s) => s.user)
  const { setClientId } = useFilterStore()
  const [searchParams, setSearchParams] = useSearchParams()

  const oauthResult = searchParams.get('meta')
  const shopifyResult = searchParams.get('shopify')
  const googleResult = searchParams.get('google')
  const oauthReason = searchParams.get('reason')
  const oauthClientId = searchParams.get('clientId')

  // The OAuth callbacks redirect back here with these query params. Rather
  // than trying to reconstruct connection state from the URL, just re-sync
  // that client's status from the server — it already has the real truth.
  useEffect(() => {
    if (oauthClientId) {
      setClientId(oauthClientId)
      if (oauthResult === 'connected') syncMetaStatus(oauthClientId)
      if (googleResult === 'connected') syncGoogleStatus(oauthClientId)
    }
    if (oauthResult || shopifyResult || googleResult) {
      const t = setTimeout(() => setSearchParams({}, { replace: true }), 6000)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthResult, shopifyResult, googleResult])

  const myClients = clients.filter((c) => user?.clientIds?.includes(c.id))

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl font-bold t1">Integrations</h1>
        <p className="text-sm t3 mt-0.5">Connect your Meta, Google, and Shopify accounts</p>
      </div>

      {oauthResult === 'connected' && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Meta Ads connected successfully</p>
            <p className="text-xs t3 mt-0.5">Choose which ad accounts to enable below</p>
          </div>
        </div>
      )}
      {oauthResult === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <XCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">Meta connection failed</p>
            {oauthReason && <p className="text-xs t3 mt-0.5">{decodeURIComponent(oauthReason)}</p>}
          </div>
        </div>
      )}
      {shopifyResult === 'connected' && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle size={18} className="text-emerald-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Shopify store connected successfully</p>
            <p className="text-xs t3 mt-0.5">Analytics are now available in the Shopify section</p>
          </div>
        </div>
      )}
      {shopifyResult === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <XCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">Shopify connection failed</p>
            {oauthReason && <p className="text-xs t3 mt-0.5">{decodeURIComponent(oauthReason)}</p>}
          </div>
        </div>
      )}
      {googleResult === 'connected' && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
          <CheckCircle size={18} className="text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Google Ads connected successfully</p>
            <p className="text-xs t3 mt-0.5">Your Google Ads data is now available in the Google Ads section</p>
          </div>
        </div>
      )}
      {googleResult === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <XCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">Google Ads connection failed</p>
            {oauthReason && <p className="text-xs t3 mt-0.5">{decodeURIComponent(oauthReason)}</p>}
          </div>
        </div>
      )}

      {myClients.length === 0 ? (
        <div className="card p-8 text-center space-y-3">
          <p className="text-sm t2">
            {user?.role === 'admin'
              ? 'This page is for client logins only — manage connections for any client from the admin panel instead.'
              : 'No client is set up for your account yet — contact your account manager.'}
          </p>
          {user?.role === 'admin' && oauthClientId && (
            <Link
              to={`/admin/clients/${oauthClientId}`}
              className="inline-block text-sm font-semibold text-indigo-500 hover:underline"
            >
              Go to this client's connections →
            </Link>
          )}
        </div>
      ) : (
        myClients.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-center gap-3 mb-1">
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: c.logoColor }}
              >
                {c.logoInitials}
              </span>
              <div>
                <p className="text-sm font-semibold t1">{c.name}</p>
                {c.industry && <p className="text-xs t3">{c.industry}</p>}
              </div>
            </div>
            <ClientMetaSection client={c} />
            <ClientShopifySection client={c} />
            <ClientGoogleSection client={c} />
          </div>
        ))
      )}
    </div>
  )
}
