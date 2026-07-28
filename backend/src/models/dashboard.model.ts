import type { Collection } from 'mongodb'
import { getDb } from '../db.js'
import { DASHBOARD_CONFIG, type DashboardBackgroundTheme } from '../config/dashboard.js'

export type { DashboardBackgroundTheme }

export interface DashboardSettingsDocument {
  _id: string
  /** @deprecated migrated to backgroundFileDark on read */
  backgroundFile?: string | null
  backgroundMimeType?: string | null
  backgroundFileDark?: string | null
  backgroundMimeTypeDark?: string | null
  backgroundFileLight?: string | null
  backgroundMimeTypeLight?: string | null
  backgroundFileMobile?: string | null
  backgroundMimeTypeMobile?: string | null
  backgroundUpdatedAtDark?: string | null
  backgroundUpdatedAtLight?: string | null
  backgroundUpdatedAtMobile?: string | null
  createdAt: string
  updatedAt: string
}

export function getDashboardSettingsCollection(): Collection<DashboardSettingsDocument> {
  return getDb().collection<DashboardSettingsDocument>(DASHBOARD_CONFIG.collection)
}
