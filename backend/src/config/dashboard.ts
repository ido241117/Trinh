import path from 'node:path'
import { fileURLToPath } from 'node:url'

function defaultDashboardBackgroundDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/dashboard-backgrounds')
}

/** Fixed on-disk names — upload always overwrites these. */
export const DASHBOARD_BACKGROUND_FILES = {
  dark: 'dark.png',
  light: 'light.png',
  mobile: 'mobile.png',
} as const

export type DashboardBackgroundTheme = keyof typeof DASHBOARD_BACKGROUND_FILES

export function dashboardBackgroundFileName(theme: DashboardBackgroundTheme): string {
  return DASHBOARD_BACKGROUND_FILES[theme]
}

export function dashboardBackgroundUrl(theme: DashboardBackgroundTheme): string {
  return `/api/dashboard/background/${DASHBOARD_BACKGROUND_FILES[theme]}`
}

export function isDashboardBackgroundFileName(fileName: string): fileName is typeof DASHBOARD_BACKGROUND_FILES[DashboardBackgroundTheme] {
  return (Object.values(DASHBOARD_BACKGROUND_FILES) as string[]).includes(fileName)
}

export const DASHBOARD_CONFIG = {
  backgroundDir: process.env.DASHBOARD_BG_DIR?.trim() || defaultDashboardBackgroundDir(),
  collection: 'dashboard_settings',
  singletonId: 'dashboard',
  /** Max upload size for a single background image */
  maxUploadBytes: 25 * 1024 * 1024,
} as const
