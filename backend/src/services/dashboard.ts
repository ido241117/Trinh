import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DASHBOARD_CONFIG,
  dashboardBackgroundFileName,
  dashboardBackgroundUrl,
} from '../config/dashboard.js'
import {
  getDashboardSettingsCollection,
  type DashboardBackgroundTheme,
  type DashboardSettingsDocument,
} from '../models/dashboard.model.js'

export interface DashboardSettingsDTO {
  backgroundImageUrlDark: string | null
  backgroundImageUrlLight: string | null
  backgroundImageUrlMobile: string | null
  backgroundUpdatedAtDark: string | null
  backgroundUpdatedAtLight: string | null
  backgroundUpdatedAtMobile: string | null
  createdAt: string
  updatedAt: string
}

export class DashboardSettingsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'DashboardSettingsError'
  }
}

export interface DashboardBackgroundChangeResult {
  settings: DashboardSettingsDTO
}

const THEMES: DashboardBackgroundTheme[] = ['dark', 'light', 'mobile']

function backgroundMimeField(
  theme: DashboardBackgroundTheme,
): 'backgroundMimeTypeDark' | 'backgroundMimeTypeLight' | 'backgroundMimeTypeMobile' {
  if (theme === 'dark') return 'backgroundMimeTypeDark'
  if (theme === 'light') return 'backgroundMimeTypeLight'
  return 'backgroundMimeTypeMobile'
}

function backgroundUpdatedAtField(
  theme: DashboardBackgroundTheme,
): 'backgroundUpdatedAtDark' | 'backgroundUpdatedAtLight' | 'backgroundUpdatedAtMobile' {
  if (theme === 'dark') return 'backgroundUpdatedAtDark'
  if (theme === 'light') return 'backgroundUpdatedAtLight'
  return 'backgroundUpdatedAtMobile'
}

function backgroundFilePath(theme: DashboardBackgroundTheme): string {
  return path.join(DASHBOARD_CONFIG.backgroundDir, dashboardBackgroundFileName(theme))
}

function backgroundExists(theme: DashboardBackgroundTheme): boolean {
  return existsSync(backgroundFilePath(theme))
}

function getMimeType(doc: DashboardSettingsDocument, theme: DashboardBackgroundTheme): string | null {
  if (theme === 'dark') return doc.backgroundMimeTypeDark ?? doc.backgroundMimeType ?? null
  if (theme === 'light') return doc.backgroundMimeTypeLight ?? null
  return doc.backgroundMimeTypeMobile ?? null
}

function getUpdatedAt(doc: DashboardSettingsDocument, theme: DashboardBackgroundTheme): string | null {
  if (theme === 'dark') return doc.backgroundUpdatedAtDark ?? null
  if (theme === 'light') return doc.backgroundUpdatedAtLight ?? null
  return doc.backgroundUpdatedAtMobile ?? null
}

function normalizeDashboardDocument(doc: DashboardSettingsDocument): DashboardSettingsDocument {
  if (doc.backgroundFile && !doc.backgroundFileDark) {
    return {
      ...doc,
      backgroundFileDark: doc.backgroundFile,
      backgroundMimeTypeDark: doc.backgroundMimeType ?? null,
      backgroundUpdatedAtDark: doc.backgroundUpdatedAtDark ?? doc.updatedAt,
    }
  }
  return doc
}

async function ensureDashboardSettingsDocument(): Promise<DashboardSettingsDocument> {
  const col = getDashboardSettingsCollection()
  const existing = await col.findOne({ _id: DASHBOARD_CONFIG.singletonId })
  if (existing) return normalizeDashboardDocument(existing)

  const now = new Date().toISOString()
  const doc: DashboardSettingsDocument = {
    _id: DASHBOARD_CONFIG.singletonId,
    backgroundFileDark: null,
    backgroundMimeTypeDark: null,
    backgroundFileLight: null,
    backgroundMimeTypeLight: null,
    backgroundFileMobile: null,
    backgroundMimeTypeMobile: null,
    backgroundUpdatedAtDark: null,
    backgroundUpdatedAtLight: null,
    backgroundUpdatedAtMobile: null,
    createdAt: now,
    updatedAt: now,
  }

  await col.insertOne(doc)
  return doc
}

/**
 * Sync Mongo with disk: if a fixed file is missing, clear that theme's metadata;
 * if a file exists but updatedAt is empty, stamp from mtime / now.
 */
async function syncBackgroundMetadata(doc: DashboardSettingsDocument): Promise<DashboardSettingsDocument> {
  let next = normalizeDashboardDocument(doc)
  const col = getDashboardSettingsCollection()
  const patch: Record<string, string | null> = {}

  for (const theme of THEMES) {
    const exists = backgroundExists(theme)
    const updatedAtField = backgroundUpdatedAtField(theme)
    const mimeField = backgroundMimeField(theme)
    const currentUpdatedAt = getUpdatedAt(next, theme)

    if (!exists) {
      if (currentUpdatedAt || getMimeType(next, theme)) {
        patch[updatedAtField] = null
        patch[mimeField] = null
        if (theme === 'dark') {
          patch.backgroundFile = null
          patch.backgroundMimeType = null
          patch.backgroundFileDark = null
        } else if (theme === 'light') {
          patch.backgroundFileLight = null
        } else {
          patch.backgroundFileMobile = null
        }
      }
      continue
    }

    // File present — ensure filename metadata points at fixed name
    const fileField =
      theme === 'dark' ? 'backgroundFileDark' : theme === 'light' ? 'backgroundFileLight' : 'backgroundFileMobile'
    patch[fileField] = dashboardBackgroundFileName(theme)

    if (!currentUpdatedAt) {
      try {
        const stat = await fs.stat(backgroundFilePath(theme))
        patch[updatedAtField] = stat.mtime.toISOString()
      } catch {
        patch[updatedAtField] = new Date().toISOString()
      }
    }
  }

  if (Object.keys(patch).length === 0) return next

  const now = new Date().toISOString()
  const cleared = await col.findOneAndUpdate(
    { _id: DASHBOARD_CONFIG.singletonId },
    { $set: { ...patch, updatedAt: now } },
    { returnDocument: 'after' },
  )

  return normalizeDashboardDocument(cleared ?? { ...next, ...patch, updatedAt: now })
}

function toDashboardSettingsDTO(doc: DashboardSettingsDocument): DashboardSettingsDTO {
  const normalized = normalizeDashboardDocument(doc)

  function slot(theme: DashboardBackgroundTheme) {
    if (!backgroundExists(theme)) {
      return { url: null as string | null, updatedAt: null as string | null }
    }
    return {
      url: dashboardBackgroundUrl(theme),
      updatedAt: getUpdatedAt(normalized, theme) ?? normalized.updatedAt,
    }
  }

  const dark = slot('dark')
  const light = slot('light')
  const mobile = slot('mobile')

  return {
    backgroundImageUrlDark: dark.url,
    backgroundImageUrlLight: light.url,
    backgroundImageUrlMobile: mobile.url,
    backgroundUpdatedAtDark: dark.updatedAt,
    backgroundUpdatedAtLight: light.updatedAt,
    backgroundUpdatedAtMobile: mobile.updatedAt,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  }
}

export async function getDashboardSettings(): Promise<DashboardSettingsDTO> {
  const doc = await ensureDashboardSettingsDocument()
  const synced = await syncBackgroundMetadata(doc)
  return toDashboardSettingsDTO(synced)
}

export async function getDashboardBackgroundMime(
  theme: DashboardBackgroundTheme,
): Promise<string | null> {
  const doc = await ensureDashboardSettingsDocument()
  return getMimeType(doc, theme)
}

/** Persist metadata after the fixed file has already been written to disk. */
export async function setDashboardBackground(input: {
  theme: DashboardBackgroundTheme
  mimeType: string
}): Promise<DashboardBackgroundChangeResult> {
  const col = getDashboardSettingsCollection()
  await ensureDashboardSettingsDocument()
  const now = new Date().toISOString()
  const fileName = dashboardBackgroundFileName(input.theme)
  const mimeField = backgroundMimeField(input.theme)
  const updatedAtField = backgroundUpdatedAtField(input.theme)
  const fileField =
    input.theme === 'dark'
      ? 'backgroundFileDark'
      : input.theme === 'light'
        ? 'backgroundFileLight'
        : 'backgroundFileMobile'

  await col.updateOne(
    { _id: DASHBOARD_CONFIG.singletonId },
    {
      $set: {
        [fileField]: fileName,
        [mimeField]: input.mimeType,
        [updatedAtField]: now,
        updatedAt: now,
        ...(input.theme === 'dark' ? { backgroundFile: null, backgroundMimeType: null } : {}),
      },
    },
    { upsert: true },
  )

  return { settings: await getDashboardSettings() }
}

export async function clearDashboardBackground(
  theme: DashboardBackgroundTheme,
): Promise<DashboardBackgroundChangeResult> {
  const col = getDashboardSettingsCollection()
  await ensureDashboardSettingsDocument()
  const now = new Date().toISOString()
  const mimeField = backgroundMimeField(theme)
  const updatedAtField = backgroundUpdatedAtField(theme)
  const fileField =
    theme === 'dark' ? 'backgroundFileDark' : theme === 'light' ? 'backgroundFileLight' : 'backgroundFileMobile'

  await fs.unlink(backgroundFilePath(theme)).catch(() => undefined)

  await col.updateOne(
    { _id: DASHBOARD_CONFIG.singletonId },
    {
      $set: {
        [fileField]: null,
        [mimeField]: null,
        [updatedAtField]: null,
        updatedAt: now,
        ...(theme === 'dark' ? { backgroundFile: null, backgroundMimeType: null } : {}),
      },
    },
    { upsert: true },
  )

  return { settings: await getDashboardSettings() }
}
