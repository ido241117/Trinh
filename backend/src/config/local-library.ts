import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Google Drive for Desktop mount each account as a drive letter whose root
 * contains a "My Drive" folder. The drive letter is NOT stable (I: today,
 * K: tomorrow, or different on another machine), so instead of hardcoding it
 * we drop a uniquely named marker file inside each account's "My Drive" and
 * discover the current letter at runtime.
 */
const MY_DRIVE_SUBDIR = 'My Drive'

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/**
 * Legacy/explicit format: `email=I:\My Drive,email2=J:\My Drive`.
 * Still supported as a manual override (and used by tests) — when present it
 * seeds the mount cache without needing drive discovery.
 */
function parseStorageMounts(raw?: string): Record<string, string> {
  const value = raw?.trim()
  if (!value) return {}

  const mounts: Record<string, string> = {}
  for (const part of value.split(',')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const email = part.slice(0, eq).trim()
    const mount = part.slice(eq + 1).trim()
    if (email && mount) {
      mounts[email] = mount.replace(/\//g, '\\')
    }
  }
  return mounts
}

/**
 * Discovery format: `email=<unique-marker-filename>`. The marker file lives
 * directly inside `<driveLetter>:\My Drive\<marker>` on each account.
 */
function parseStorageMarkers(raw?: string): Record<string, string> {
  const value = raw?.trim()
  if (!value) return {}

  const markers: Record<string, string> = {}
  for (const part of value.split(',')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const email = part.slice(0, eq).trim()
    const marker = part.slice(eq + 1).trim()
    if (email && marker) {
      markers[email] = marker
    }
  }
  return markers
}

// email -> mount path (e.g. "I:\My Drive"). Seeded from the explicit override,
// then replaced by discovery when markers are configured.
let discoveredMounts: Record<string, string> = parseStorageMounts(process.env.OFFLINE_STORAGE_MOUNTS)
// email -> marker filename
const markerRegistry: Record<string, string> = parseStorageMarkers(process.env.OFFLINE_STORAGE_MARKERS)

export const LOCAL_LIBRARY_CONFIG = {
  dbName: process.env.LOCAL_LIBRARY_MONGODB_DB ?? 'Projectd_d3',
  collections: {
    hako: process.env.LOCAL_LIBRARY_HAKO_COLLECTION ?? 'books_hako',
    epub: process.env.LOCAL_LIBRARY_EPUB_COLLECTION ?? 'books_epub',
    pdf: process.env.LOCAL_LIBRARY_PDF_COLLECTION ?? 'books_pdf',
  },
  imgDir: requireEnv('OFFLINE_IMG_DIR'),
  hakoBookDir: requireEnv('OFFLINE_EPUB_DIR'),
  /**
   * Text-only EPUB mirror (images stripped). Same filenames as hakoBookDir.
   * Used for fast first paint; full file upgrades in the background.
   */
  hakoBookNopictureDir: process.env.OFFLINE_EPUB_NOPICTURE_DIR?.trim() || '',
  importDir: requireEnv('OFFLINE_IMPORT_DIR'),
  hakoSubdir: process.env.OFFLINE_HAKO_SUBDIR?.trim() || 'Book',
  importSubdir: process.env.OFFLINE_IMPORT_SUBDIR?.trim() || 'Import',
} as const

export function getStorageMounts(): Record<string, string> {
  return { ...discoveredMounts }
}

export function resolveColdStorageMount(drive?: string | null): string | null {
  const email = drive?.trim()
  if (!email) return null
  return discoveredMounts[email] ?? null
}

export function resolveHakoBookDir(drive?: string | null): string {
  const mount = resolveColdStorageMount(drive)
  if (!mount) return LOCAL_LIBRARY_CONFIG.hakoBookDir
  return `${mount}\\${LOCAL_LIBRARY_CONFIG.hakoSubdir}`
}

export function resolveImportDir(drive?: string | null): string {
  const mount = resolveColdStorageMount(drive)
  if (!mount) return LOCAL_LIBRARY_CONFIG.importDir
  return `${mount}\\${LOCAL_LIBRARY_CONFIG.importSubdir}`
}

export function listAllowedLibraryRoots(): string[] {
  const roots = new Set<string>([
    LOCAL_LIBRARY_CONFIG.hakoBookDir,
    LOCAL_LIBRARY_CONFIG.importDir,
    LOCAL_LIBRARY_CONFIG.imgDir,
  ])

  if (LOCAL_LIBRARY_CONFIG.hakoBookNopictureDir) {
    roots.add(LOCAL_LIBRARY_CONFIG.hakoBookNopictureDir)
  }

  for (const mount of Object.values(discoveredMounts)) {
    roots.add(mount)
    roots.add(`${mount}\\${LOCAL_LIBRARY_CONFIG.hakoSubdir}`)
    roots.add(`${mount}\\${LOCAL_LIBRARY_CONFIG.importSubdir}`)
  }

  return [...roots]
}

export interface ColdStorageStatus {
  /** All accounts we expect to find (from marker registry, or the seed). */
  expected: string[]
  /** Accounts whose Google Drive is currently mounted and resolvable. */
  mounted: string[]
  /** Expected accounts that are not mounted right now. */
  missing: string[]
  /** email -> resolved mount path. */
  mounts: Record<string, string>
}

export function getColdStorageStatus(): ColdStorageStatus {
  const expected = Object.keys(markerRegistry).length > 0
    ? Object.keys(markerRegistry)
    : Object.keys(discoveredMounts)
  const mounted = expected.filter(email => Boolean(discoveredMounts[email]))
  const missing = expected.filter(email => !discoveredMounts[email])
  return { expected, mounted, missing, mounts: getStorageMounts() }
}

/** Enumerate current drive letters via `wmic`, falling back to a C..Z scan. */
async function listDriveLetters(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('wmic', ['logicaldisk', 'get', 'caption'], {
      windowsHide: true,
      timeout: 8000,
    })
    const drives = stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /^[A-Za-z]:$/.test(line))
    if (drives.length > 0) return drives
  } catch {
    // wmic can be missing/deprecated on newer Windows — fall through to scan.
  }

  const letters: string[] = []
  for (let code = 'C'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
    const drive = `${String.fromCharCode(code)}:`
    if (existsSync(`${drive}\\`)) letters.push(drive)
  }
  return letters
}

let refreshInFlight: Promise<ColdStorageStatus> | null = null

async function runDiscovery(): Promise<ColdStorageStatus> {
  // No markers configured -> keep whatever the explicit override seeded.
  if (Object.keys(markerRegistry).length === 0) {
    return getColdStorageStatus()
  }

  const drives = await listDriveLetters()
  const found: Record<string, string> = {}

  for (const drive of drives) {
    const myDrive = `${drive}\\${MY_DRIVE_SUBDIR}`
    for (const [email, marker] of Object.entries(markerRegistry)) {
      if (found[email]) continue
      if (existsSync(`${myDrive}\\${marker}`)) {
        found[email] = myDrive
      }
    }
  }

  discoveredMounts = found
  return getColdStorageStatus()
}

/**
 * Re-scan drives to (re)discover Google Drive mounts. Safe to call repeatedly;
 * concurrent calls share a single in-flight scan. Never throws — on failure the
 * previously discovered mounts are kept.
 */
export function refreshStorageMounts(): Promise<ColdStorageStatus> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = runDiscovery()
    .catch(() => getColdStorageStatus())
    .finally(() => {
      refreshInFlight = null
    }) as Promise<ColdStorageStatus>
  return refreshInFlight
}
