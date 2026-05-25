import { useAuthStore } from '@/store/authStore'

export const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
