import { createContext, useContext, type ReactNode } from 'react'

export type AppTheme = 'light' | 'dark'

interface AppThemeContextValue {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
  isDarkMode: boolean
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null)

export function AppThemeProvider({
  theme,
  setTheme,
  children,
}: {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
  children: ReactNode
}) {
  return (
    <AppThemeContext.Provider value={{ theme, setTheme, isDarkMode: theme === 'dark' }}>
      {children}
    </AppThemeContext.Provider>
  )
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext)
  if (!ctx) {
    throw new Error('useAppTheme must be used within AppThemeProvider')
  }
  return ctx
}
