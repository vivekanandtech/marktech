import { useAuthStore } from '@/store/authStore'

export const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  // A 401 here always means the token itself is bad — expired, or (after an
  // auth-model change like moving to real per-user JWTs) signed under a
  // shape the server no longer accepts. Log out immediately rather than
  // leaving a stale session making calls that will never succeed —
  // ProtectedRoute then sends them back to a real login.
  if (res.status === 401 && token) {
    useAuthStore.getState().logout()
  }
  return res
}
