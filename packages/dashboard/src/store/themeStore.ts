import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'dark' | 'light' | 'auto'

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === 'auto' ? getSystemTheme() : mode
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
}

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  resolvedTheme: () => 'dark' | 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      setMode: (mode) => {
        set({ mode })
        applyTheme(mode)
      },
      resolvedTheme: () => {
        const m = get().mode
        return m === 'auto' ? getSystemTheme() : m
      },
    }),
    { name: 'marktech-theme' }
  )
)

export function initTheme() {
  const stored = localStorage.getItem('marktech-theme')
  const mode: ThemeMode = stored ? (JSON.parse(stored)?.state?.mode ?? 'dark') : 'dark'
  applyTheme(mode)

  // React to system preference changes when in auto mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = useThemeStore.getState().mode
    if (current === 'auto') applyTheme('auto')
  })
}
