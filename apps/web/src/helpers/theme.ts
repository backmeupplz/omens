import { useCallback, useLayoutEffect, useState } from 'preact/hooks'

export type ThemeMode = 'dark' | 'light'
export const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

const THEME_STORAGE_KEY = 'omens-theme'
const THEME_EVENT = 'omens-theme-change'

function normalizeTheme(value: string | null | undefined): ThemeMode {
  return value === 'light' ? 'light' : 'dark'
}

export function getSavedTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('np-theme-light', theme === 'light')
}

export function setThemePreference(theme: ThemeMode) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: theme }))
  }
  applyTheme(theme)
}

export function useInitializeThemePreference() {
  useLayoutEffect(() => {
    applyTheme(getSavedTheme())
  }, [])
}

export function useThemePreference() {
  const [theme, setThemeState] = useState<ThemeMode>(getSavedTheme)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setThemeState(getSavedTheme())
    }
    const onThemeEvent = (event: Event) => {
      const next = (event as CustomEvent<ThemeMode>).detail
      setThemeState(normalizeTheme(next))
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(THEME_EVENT, onThemeEvent as EventListener)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(THEME_EVENT, onThemeEvent as EventListener)
    }
  }, [])

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next)
    setThemePreference(next)
  }, [])

  return { theme, setTheme }
}
