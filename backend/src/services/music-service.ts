import fs from 'fs'
import { readdir, stat } from 'fs/promises'
import { spawn } from 'child_process'
import { join, extname, basename } from 'path'
import { tmpdir } from 'os'
import md5 from 'md5'
import { parseFile } from 'music-metadata'
import sharp from 'sharp'
import type { Track } from '../types.js'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.opus', '.ogg'])

// ── Cover processing ─────────────────────────────────────────────────────────

export async function processCover(
  absolutePath: string,
  imgDir: string,
  id: string
): Promise<string | null> {
  try {
    const metadata = await parseFile(absolutePath)
    const pic = metadata.common.picture?.[0]
    if (!pic) return null

    const outPath = join(imgDir, `${id}.jpg`)
    await sharp(Buffer.from(pic.data))
      .resize(100, 100)
      .jpeg({ quality: 85 })
      .toFile(outPath)

    return `${id}.jpg`
  } catch {
    return null
  }
}

// ── File editing (GDrive-safe) ───────────────────────────────────────────────

function escapePsSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

/** Set Windows LastWriteTime via PowerShell (used in 8-step transform on temp file). */
export function setWindowsLastWriteTime(filePath: string, date: Date): Promise<void> {
  const literalPath = escapePsSingleQuoted(filePath)
  const iso = date.toISOString()
  const command =
    `(Get-Item -LiteralPath '${literalPath}').LastWriteTime = (Get-Date '${iso}')`

  return new Promise((resolve, reject) => {
    const proc = spawn('powershell', ['-NoProfile', '-Command', command])
    let stderr = ''
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (chunk: string) => { stderr += chunk })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`))
    })
  })
}

/**
 * Thuật toán 8 bước (GDrive-safe):
 * 1. Đọc mtime gốc
 * 2. Copy sang tmpdir (ngoài GDrive)
 * 3. Chạy transform tại tempPath
 * 4. Safety check: tempPath.size > 0
 * 5. Xóa srcPath (GDrive thấy "deleted")
 * 6. Copy tempPath → destPath (GDrive thấy "new file")
 * 7. Ghi mtime về destPath (giữ gốc hoặc finalMtime nếu chỉnh ngày)
 * 8. [finally] Xóa tempPath
 */
export async function withMtimePreserved(
  srcPath: string,
  destPath: string,
  transform: (tempPath: string) => Promise<void>,
  finalMtime?: Date,
): Promise<void> {
  const tempPath = join(tmpdir(), `medit-${Date.now()}.mp3`)
  try {
    const { mtime: originalMtime } = fs.statSync(srcPath)
    fs.copyFileSync(srcPath, tempPath)

    await transform(tempPath)

    const { size } = fs.statSync(tempPath)
    if (size === 0) throw new Error('Temp file is empty — aborting to protect source file')

    fs.unlinkSync(srcPath)
    fs.copyFileSync(tempPath, destPath)
    const appliedMtime = finalMtime ?? originalMtime
    fs.utimesSync(destPath, appliedMtime, appliedMtime)
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
}

/** Cắt MP3 giữ nguyên codec (-c copy). Ghi đè inputPath khi xong. */
export async function trimMp3(
  inputPath: string,
  startSec: number,
  endSec: number,
): Promise<void> {
  const outputPath = join(tmpdir(), `trim-${Date.now()}.mp3`)
  const durationSec = endSec - startSec

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-ss', String(startSec),
      '-i', inputPath,
      '-t', String(durationSec),
      '-c', 'copy',
      outputPath,
    ])
    let stderr = ''
    proc.stderr.setEncoding('utf8')
    proc.stderr.on('data', (chunk: string) => { stderr += chunk })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`))
    })
  })

  try {
    fs.unlinkSync(inputPath)
    fs.copyFileSync(outputPath, inputPath)
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
  }
}

export async function readAudioDuration(filePath: string): Promise<number> {
  const metadata = await parseFile(filePath, { duration: true })
  return Math.round(metadata.format.duration ?? 0)
}

/** Chỉnh dateModified qua shell + thuật toán 8 bước. */
export async function replaceFileWithMtime(
  filePath: string,
  newMtime: Date,
): Promise<void> {
  await withMtimePreserved(
    filePath,
    filePath,
    async (tempPath) => {
      await setWindowsLastWriteTime(tempPath, newMtime)
    },
    newMtime,
  )
}

// ── Library scanner ──────────────────────────────────────────────────────────

async function collectAudioFiles(dir: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectAudioFiles(fullPath, results)
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      results.push(fullPath)
    }
  }
}

export async function buildTrack(filePath: string): Promise<Track> {
  // IMPORTANT: fs.stat is read-only — never modifies dateModified
  const fileStat = await stat(filePath)
  const ext = extname(filePath).toLowerCase().slice(1)
  const filename = basename(filePath, extname(filePath))

  let duration = 0
  let artist: string | undefined
  let album: string | undefined
  let hasCover = false

  try {
    // Sprint 2: parse once — read duration, tags, AND check for cover art
    const metadata = await parseFile(filePath, { duration: true })
    duration = Math.round(metadata.format.duration ?? 0)
    const rawArtist = metadata.common.artist?.trim()
    const rawAlbum = metadata.common.album?.trim()
    if (rawArtist) artist = rawArtist
    if (rawAlbum) album = rawAlbum
    hasCover = (metadata.common.picture?.length ?? 0) > 0
  } catch {
    // File unreadable by music-metadata (corrupt, non-standard) — use defaults
  }

  const track: Track = {
    id: md5(filePath),
    filename,
    absolutePath: filePath,
    dateModified: fileStat.mtime.toISOString(),
    duration,
    format: ext,
    hasCover,
  }
  if (artist) track.artist = artist
  if (album) track.album = album

  return track
}

export async function scanMusicFolder(folderPath: string): Promise<Track[]> {
  const filePaths: string[] = []
  await collectAudioFiles(folderPath, filePaths)

  const tracks = await Promise.all(filePaths.map(buildTrack))

  // Sort: newest dateModified first
  return tracks.sort(
    (a, b) => new Date(b.dateModified).getTime() - new Date(a.dateModified).getTime()
  )
}
