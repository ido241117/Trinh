import fs from 'fs'
import { Router } from 'express'
import { extname, isAbsolute, join } from 'path'
import { mkdir } from 'fs/promises'
import { spawn } from 'child_process'
import {
  buildYtdlpBaseArgs,
  formatYtdlpFailure,
  patchMp3CoverFromYoutubeUrl,
  resolveYtdlpDownloadTarget,
} from '../services/youtube-service.js'
import { buildTrack, processCover } from '../services/music-service.js'
import { getTrackCollection } from '../models/track.model.js'
import type { Track } from '../types.js'

const YOUTUBE_URL_RE = /^https:\/\/(www\.youtube\.com\/watch\?|youtu\.be\/).+/

function isYtdlpOutputFilePath(line: string): boolean {
  return isAbsolute(line) && line.toLowerCase().endsWith('.mp3')
}

async function findNewestMp3InDirectory(dir: string): Promise<string | null> {
  if (!fs.existsSync(dir)) return null
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  let newest: { path: string; mtime: number } | null = null

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (extname(entry.name).toLowerCase() !== '.mp3') continue

    const absolutePath = join(dir, entry.name)
    try {
      const stat = await fs.promises.stat(absolutePath)
      const mtime = stat.mtime.getTime()
      if (!newest || mtime > newest.mtime) {
        newest = { path: absolutePath, mtime }
      }
    } catch {
      continue
    }
  }

  return newest?.path ?? null
}

function toTrackDto(track: Track & { coverFile?: string | null }) {
  const { absolutePath: _, ...dto } = track
  return dto
}

/** Index a single downloaded file into Mongo — O(1) disk work, no full library scan. */
async function upsertDownloadedTrack(filePath: string, imgDir: string) {
  await mkdir(imgDir, { recursive: true })
  const track = await buildTrack(filePath)
  const coverFile = track.hasCover
    ? await processCover(track.absolutePath, imgDir, track.id)
    : null
  const scannedAt = new Date().toISOString()
  const { id, ...rest } = track

  await getTrackCollection().updateOne(
    { _id: id } as never,
    {
      $set: {
        ...rest,
        coverFile,
        scannedAt,
      },
    } as never,
    { upsert: true },
  )

  return toTrackDto({ ...track, coverFile })
}

export function createYtdlpRouter(musicFolder: string, imgDir: string) {
  const router = Router()

  // GET /api/ytdlp/download?url=... — SSE stream of yt-dlp output
  router.get('/download', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    function send(type: string, data: string) {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
    }

    const url = req.query.url as string | undefined

    if (!url || !YOUTUBE_URL_RE.test(url)) {
      send('error', 'URL không hợp lệ — chỉ nhận youtube.com hoặc youtu.be')
      res.end()
      return
    }

    let outputTemplate: string
    let outputPath = ''
    send('log', 'Đang lấy thông tin video...')
    try {
      const target = await resolveYtdlpDownloadTarget(musicFolder, url)
      outputTemplate = target.outputTemplate
      outputPath = target.outputPath
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không lấy được tên file từ yt-dlp'
      send('error', msg)
      res.end()
      return
    }

    const proc = spawn('yt-dlp', [
      ...buildYtdlpBaseArgs(),
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-playlist',
      '-o', outputTemplate,
      '--print', 'after_move:filepath',
      url,
    ], {
      env: { ...process.env, PYTHONUTF8: '1' },
      windowsHide: true,
    })

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    let actualOutputPath = ''
    let stderr = ''
    let settled = false

    const fail = (msg: string) => {
      if (settled) return
      settled = true
      send('error', msg)
      res.end()
    }

    proc.stdout.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (isYtdlpOutputFilePath(trimmed)) {
          actualOutputPath = trimmed
        }
        send('log', line)
      }
    })

    proc.stderr.on('data', (chunk: string) => {
      stderr += chunk
      for (const line of chunk.split('\n')) {
        if (line.trim()) send('log', line)
      }
    })

    proc.on('error', (err) => {
      fail(err.message)
    })

    proc.on('close', (code: number | null) => {
      if (settled) return
      if (code === 0) {
        void (async () => {
          try {
            send('log', 'Đang xác định file MP3 mới nhất...')

            const verifiedActualPath = actualOutputPath && fs.existsSync(actualOutputPath)
              ? actualOutputPath
              : ''
            const verifiedOutputPath = !verifiedActualPath && outputPath && fs.existsSync(outputPath)
              ? outputPath
              : ''

            const downloadPath =
              verifiedActualPath ||
              verifiedOutputPath ||
              (await findNewestMp3InDirectory(musicFolder))

            if (!downloadPath) {
              settled = true
              send('error', 'Không tìm được file MP3 mới sau khi tải')
              res.end()
              return
            }

            send('log', `Đang gắn ảnh bìa YouTube cho ${downloadPath}`)
            let coverNote = 'và đã gắn ảnh bìa'
            try {
              await patchMp3CoverFromYoutubeUrl(downloadPath, url)
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Không gắn được ảnh bìa'
              coverNote = `nhưng không gắn được ảnh bìa: ${msg}`
            }

            send('log', 'Đang cập nhật thư viện (1 file)...')
            const track = await upsertDownloadedTrack(downloadPath, imgDir)
            send('track', JSON.stringify(track))
            send('done', `Tải xong ${coverNote}!`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Không index được bài mới'
            send('error', msg)
          } finally {
            settled = true
            res.end()
          }
        })()
      } else {
        fail(formatYtdlpFailure(stderr, code, 'yt-dlp thoát với mã lỗi'))
      }
    })

    req.on('close', () => {
      proc.kill()
    })
  })

  return router
}
