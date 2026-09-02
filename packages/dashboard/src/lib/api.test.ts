import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch } from './api'
import { useAuthStore } from '@/store/authStore'

function mockResponse(status: number, body: unknown = null) {
  const res = {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }
  return { ...res, clone: () => ({ ...res }) } as unknown as Response
}

describe('apiFetch', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: true, user: null, token: 'a-token' })
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('attaches the Authorization header when a token is present', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse(200))
    global.fetch = fetchSpy as any

    await apiFetch('/api/clients')

    const [, init] = fetchSpy.mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer a-token')
  })

  it('logs out on a 401 whose body signals a real auth failure — this is what makes a stale/invalid session self-heal instead of failing silently forever', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(401, { error: 'Unauthorized' })) as any

    await apiFetch('/api/clients')

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('logs out on a 401 with no parseable body — an unrecognized shape defaults to treating the session as dead', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(401)) as any

    await apiFetch('/api/clients')

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('does not log out on a 401 that just means a platform isn\'t connected for this client — confirmed live regression: CountryDropdown\'s /api/shopify/countries call was force-logging-out valid sessions this way', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(401, { error: 'Shopify not connected for this client' })) as any

    await apiFetch('/api/shopify/countries?clientId=some-client')

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('does not log out on a successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(200)) as any

    await apiFetch('/api/clients')

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('does not log out on a 403 — that means "not your client," not "bad session"', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockResponse(403)) as any

    await apiFetch('/api/metrics/overview?clientId=someone-elses-client')

    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('does not attempt to log out again when there was no token to begin with', async () => {
    useAuthStore.setState({ isAuthenticated: false, user: null, token: null })
    const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout')
    global.fetch = vi.fn().mockResolvedValue(mockResponse(401)) as any

    await apiFetch('/api/clients')

    expect(logoutSpy).not.toHaveBeenCalled()
  })
})
