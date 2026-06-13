import { useState, useEffect, FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { API } from '@/lib/api'

export function LoginPage() {
  const { isAuthenticated, login } = useAuthStore()
  const [email, setEmail] = useState('admin@velora.com')
  const [password, setPassword] = useState('demo1234')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [waking, setWaking] = useState(false)

  // Pre-warm the API on page load — Render's free tier sleeps after 15min
  // idle, so this gives the server a head start while the user types.
  useEffect(() => {
    fetch(`${API}/health`).catch(() => {})
  }, [])

  if (isAuthenticated) return <Navigate to="/overview" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    setWaking(false)

    const wakingTimer = setTimeout(() => setWaking(true), 4000)
    const controller = new AbortController()
    const timeoutTimer = setTimeout(() => controller.abort(), 45000)

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Invalid email or password.')
      } else {
        login(data.user, data.token)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Server took too long to respond. It may be waking up from sleep — please try again.')
      } else {
        setError('Cannot reach server. Check your connection and try again.')
      }
    } finally {
      clearTimeout(wakingTimer)
      clearTimeout(timeoutTimer)
      setLoading(false)
      setWaking(false)
    }
  }

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/25">
            <Zap size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold t1">Marktech</h1>
          <p className="text-sm t3 mt-1">Ads Intelligence Platform</p>
        </div>

        <div className="card rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-semibold t1 mb-1">Sign in</h2>
          <p className="text-sm t3 mb-6">Access your agency dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium t2 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-surface-2 border border-theme rounded-lg text-sm t1 placeholder:t3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium t2 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 pr-10 bg-surface-2 border border-theme rounded-lg text-sm t1 placeholder:t3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 t3 hover:t1 transition-colors"
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {loading && waking && (
              <p className="flex items-center gap-1.5 text-xs t3 justify-center">
                <Loader2 size={12} className="animate-spin" />
                Waking up the server — this can take up to 30 seconds on first load…
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-xs t3 mt-4">
            Demo: admin@velora.com · demo1234
          </p>
        </div>
      </div>
    </div>
  )
}
