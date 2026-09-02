import { useAuthStore } from '@/store/authStore'

export const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

// The only two messages app.ts's onRequest JWT hook actually sends on a real
// auth failure (expired token, or a pre-JWT-model session shape it no longer
// accepts). Every other 401 in this codebase is a route-level "this
// integration isn't connected for this client" response (e.g. "Shopify not
// connected for this client") — legitimate, expected state for any client
// that hasn't connected that platform yet, not a dead session. Confirmed
// live: CountryDropdown's plain apiFetch call to /api/shopify/countries hit
// exactly that case and force-logged-out an otherwise-valid session.
const AUTH_FAILURE_MESSAGES = new Set([
  'Unauthorized',
  'Session from a previous version — please log in again',
])

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (res.status === 401 && token) {
    const body = await res.clone().json().catch(() => null)
    if (!body?.error || AUTH_FAILURE_MESSAGES.has(body.error)) {
      useAuthStore.getState().logout()
    }
  }
  return res
}
