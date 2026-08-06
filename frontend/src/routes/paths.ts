import type { Tab } from '../components/Sidebar/Sidebar'

export const ACTIVE_TAB_STORAGE_KEY = 'app-active-tab'

export const TAB_PATHS: Record<Tab, string> = {
  dashboard: '/dashboard',
  music: '/music',
  watchlist: '/watchlist',
  'local-library': '/local-library',
  journal: '/journal',
  'ai-quota': '/ai-quota',
  accounts: '/accounts',
}

export function isTab(value: string | null): value is Tab {
  return value === 'dashboard'
    || value === 'music'
    || value === 'watchlist'
    || value === 'local-library'
    || value === 'journal'
    || value === 'ai-quota'
    || value === 'accounts'
}

export function tabFromPathname(pathname: string): Tab | null {
  const entries = Object.entries(TAB_PATHS) as [Tab, string][]
  for (const [tab, path] of entries) {
    if (pathname === path || pathname.startsWith(`${path}/`)) return tab
  }
  return null
}

export function localLibraryBookPath(bookId: string): string {
  return `/local-library/books/${encodeURIComponent(bookId)}`
}

export function localLibraryReadPath(bookId: string): string {
  return `/local-library/books/${encodeURIComponent(bookId)}/read`
}

export function defaultPathFromStorage(storageKey = ACTIVE_TAB_STORAGE_KEY): string {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === 'books') return TAB_PATHS['local-library']
    if (isTab(stored)) return TAB_PATHS[stored]
  } catch {
    // ignore quota / private mode
  }
  return TAB_PATHS.music
}
