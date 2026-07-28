import { Buffer } from 'node:buffer'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { spawn } from 'child_process'
import NodeID3 from 'node-id3'
import sharp from 'sharp'
import { withMtimePreserved } from './music-service.js'

// ── YouTube Data API / link metadata ─────────────────────────────────────────

// Regex handles: watch?v=, youtu.be/, m.youtube.com/watch?v=
const YT_REGEX = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/

export function extractVideoId(url: string): string | null {
  if (!url) return null
  const match = YT_REGEX.exec(url)
  return match ? match[1] : null
}

export async function fetchVideoMetadata(videoId: string): Promise<{
  title: string
  thumbnailUrl: string
} | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not configured')
  }

  const apiUrl =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`

  let response: Response
  try {
    response = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) })
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      throw new Error('YouTube API timeout')
    }
    throw err
  }

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`)
  }

  const data = await response.json() as {
    items: Array<{
      snippet: {
        title: string
        thumbnails: { high?: { url: string }; default?: { url: string } }
      }
    }>
  }

  if (!data.items || data.items.length === 0) {
    return null
  }

  const snippet = data.items[0].snippet
  const thumbnailUrl =
    snippet.thumbnails.high?.url ?? snippet.thumbnails.default?.url ?? ''

  return {
    title: snippet.title,
    thumbnailUrl,
  }
}

export async function fetchYoutubeLinkMetadata(url: string): Promise<{
  videoId: string
  title: string
  url: string
  thumbnailUrl: string
} | null> {
  const videoId = extractVideoId(url)
  if (!videoId) return null

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  const defaultThumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`

  try {
    const metadata = await fetchVideoMetadata(videoId)
    if (metadata) {
      return {
        videoId,
        title: metadata.title,
        url: watchUrl,
        thumbnailUrl: metadata.thumbnailUrl || defaultThumbnail,
      }
    }
  } catch {
    // Fall back to oEmbed or generic metadata below.
  }

  try {
    const oembedUrl =
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
    const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) })
    if (response.ok) {
      const data = await response.json() as { title?: string }
      return {
        videoId,
        title: data.title?.trim() || 'YouTube video',
        url: watchUrl,
        thumbnailUrl: defaultThumbnail,
      }
    }
  } catch {
    // Fall back to generic metadata below.
  }

  return {
    videoId,
    title: 'YouTube video',
    url: watchUrl,
    thumbnailUrl: defaultThumbnail,
  }
}

// ── Cover patch from YouTube thumbnail ───────────────────────────────────────

function normalizeImageMime(contentType: string | null): string {
  const raw = contentType?.split(';')[0].trim().toLowerCase() ?? ''
  if (raw === 'image/jpeg' || raw === 'image/jpg') return 'image/jpeg'
  if (raw === 'image/png') return 'image/png'
  return 'image/jpeg'
}

async function fetchThumbnailBuffer(thumbnailUrl: string): Promise<{ imageBuffer: Buffer; mime: string }> {
  const response = await fetch(thumbnailUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch thumbnail image (${response.status})`)
  }

  const mime = normalizeImageMime(response.headers.get('content-type'))
  const sourceBuffer = Buffer.from(await response.arrayBuffer())

  if (mime === 'image/jpeg' || mime === 'image/png') {
    return { imageBuffer: sourceBuffer, mime }
  }

  const imageBuffer = await sharp(sourceBuffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()

  return { imageBuffer, mime: 'image/jpeg' }
}

export async function patchMp3CoverFromYoutubeUrl(filePath: string, youtubeUrl: string): Promise<{ thumbnailUrl: string }> {
  const metadata = await fetchYoutubeLinkMetadata(youtubeUrl)
  if (!metadata) {
    throw new Error('Invalid YouTube URL')
  }

  const { imageBuffer, mime } = await fetchThumbnailBuffer(metadata.thumbnailUrl)

  await withMtimePreserved(filePath, filePath, async (tempPath) => {
    const result = NodeID3.update(
      {
        image: {
          mime,
          type: { id: 3, name: 'Cover (front)' },
          description: 'YouTube cover art',
          imageBuffer,
        },
      },
      tempPath,
    )

    if (result !== true) {
      const msg = result instanceof Error ? result.message : 'node-id3 update failed'
      throw new Error(msg)
    }
  })

  return { thumbnailUrl: metadata.thumbnailUrl }
}

// ── yt-dlp output naming / download target ───────────────────────────────────

/** DDMM suffix, e.g. 28 May → "2805" */
export function getDateSuffix(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}${mm}`
}

/**
 * Title không có ký tự “thật” (chỉ - _ . khoảng trắng).
 * Unicode (中文, emoji, ký tự lạ) vẫn được coi là title hợp lệ.
 */
export function isWeakTitle(title: string): boolean {
  return title.trim().replace(/[-_\s.]+/g, '').length === 0
}

export type YtdlpNaming =
  | { mode: 'title' }
  | { mode: 'id' }
  | { mode: 'title-suffix'; suffix: string }
  | { mode: 'id-suffix'; suffix: string }

/** Luôn dùng field template yt-dlp — không nhúng title unicode thẳng vào -o */
export function buildOutputTemplate(musicFolder: string, naming: YtdlpNaming): string {
  const dir = toYtdlpOutputPath(musicFolder)
  switch (naming.mode) {
    case 'title':
      return `${dir}/%(title)s.%(ext)s`
    case 'id':
      return `${dir}/%(id)s.%(ext)s`
    case 'title-suffix':
      return `${dir}/%(title)s ${naming.suffix}.%(ext)s`
    case 'id-suffix':
      return `${dir}/%(id)s ${naming.suffix}.%(ext)s`
  }
}

/** Bỏ phần đuôi format tạm (.webm…) trước khi thành .mp3 */
export function normalizeMp3Basename(filename: string): string {
  let base = basename(filename.replace(/\\/g, '/'))
  base = base.replace(/\.(webm|m4a|opus|oga|ogg|wav)(?=\.mp3$)/i, '')
  if (!/\.mp3$/i.test(base)) {
    base = base.replace(/\.(webm|m4a|opus|oga|ogg|wav)$/i, '.mp3')
  }
  return base
}

/** Forward slashes so yt-dlp does not treat D:\... as a URL (scheme "d"). */
export function toYtdlpOutputPath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

export interface YtdlpVideoMeta {
  title: string
  id: string
}

function isEnvTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

export function buildYtdlpBaseArgs(): string[] {
  const args = ['--js-runtimes', 'node']

  if (isEnvTrue(process.env.YTDLP_YOUTUBE_COOKIES)) {
    const cookiesPath = process.env.YTDLP_YOUTUBE_COOKIES_FILE?.trim()
    if (cookiesPath && existsSync(cookiesPath)) {
      args.push('--cookies', cookiesPath)
    }
  }

  return args
}

function runYtdlp(args: string[], url: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', [...buildYtdlpBaseArgs(), ...args, url], {
      env: { ...process.env, PYTHONUTF8: '1' },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => { stdout += chunk })
    proc.stderr.on('data', (chunk: string) => { stderr += chunk })
    proc.on('close', (code) => resolve({ stdout, stderr, code }))
  })
}

export async function fetchYtdlpMetadata(url: string): Promise<YtdlpVideoMeta> {
  const { stdout, stderr, code } = await runYtdlp(
    ['--no-playlist', '--no-download', '--dump-single-json'],
    url,
  )

  if (code !== 0) {
    throw new Error(stderr.trim() || `yt-dlp metadata failed with code ${code}`)
  }

  const data = JSON.parse(stdout) as { title?: string; id?: string }
  if (!data.id) {
    throw new Error('yt-dlp metadata missing video id')
  }

  return {
    title: typeof data.title === 'string' ? data.title : '',
    id: data.id,
  }
}

async function fetchPredictedBasename(url: string, outputTemplate: string): Promise<string> {
  const { stdout, stderr, code } = await runYtdlp(
    [
      '-x',
      '--audio-format', 'mp3',
      '--no-playlist',
      '--no-download',
      '-o', toYtdlpOutputPath(outputTemplate),
      '--print', 'filename',
    ],
    url,
  )

  const value = stdout.trim()
  if (code !== 0 || !value) {
    throw new Error(stderr.trim() || `yt-dlp --print filename failed with code ${code}`)
  }

  return normalizeMp3Basename(value)
}

/** Chọn template yt-dlp; thêm DDMM qua %(title)s|id)s suffix nếu file .mp3 đã tồn tại */
export async function resolveYtdlpOutputTemplate(
  musicFolder: string,
  url: string,
  fileExists: (path: string) => boolean = existsSync,
  date = new Date(),
): Promise<string> {
  return (await resolveYtdlpDownloadTarget(musicFolder, url, fileExists, date)).outputTemplate
}

export interface YtdlpDownloadTarget {
  outputTemplate: string
  outputPath: string
}

export async function resolveYtdlpDownloadTarget(
  musicFolder: string,
  url: string,
  fileExists: (path: string) => boolean = existsSync,
  date = new Date(),
): Promise<YtdlpDownloadTarget> {
  const { title } = await fetchYtdlpMetadata(url)
  const useId = isWeakTitle(title)

  const baseNaming: YtdlpNaming = useId ? { mode: 'id' } : { mode: 'title' }
  const baseTemplate = buildOutputTemplate(musicFolder, baseNaming)
  const predictedMp3 = await fetchPredictedBasename(url, baseTemplate)
  const basePath = join(musicFolder, predictedMp3)

  if (!fileExists(basePath)) {
    return {
      outputTemplate: baseTemplate,
      outputPath: basePath,
    }
  }

  const suffix = getDateSuffix(date)
  const suffixedNaming: YtdlpNaming = useId
    ? { mode: 'id-suffix', suffix }
    : { mode: 'title-suffix', suffix }

  const suffixedTemplate = buildOutputTemplate(musicFolder, suffixedNaming)
  const suffixedPredictedMp3 = await fetchPredictedBasename(url, suffixedTemplate)

  return {
    outputTemplate: suffixedTemplate,
    outputPath: join(musicFolder, suffixedPredictedMp3),
  }
}
