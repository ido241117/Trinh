import { createHash, randomBytes } from 'crypto'
import { createWriteStream } from 'fs'
import fs from 'fs/promises'
import { dirname, extname, join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { Filter } from 'mongodb'
import { getJournalMessagesCollection, type JournalLocalAttachment, type JournalMessageDocument } from '../models/journal.model.js'

export interface JournalAttachmentDTO {
  originalUrl: string
  url: string
  fileName: string
  contentType?: string
  sizeBytes?: number
}

export interface JournalMessageDTO {
  id: string
  messageId: string
  author: string
  timestamp: string
  content: string
  attachments: JournalAttachmentDTO[]
  hasAttachments: boolean
  pinned?: boolean
  pinnedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface JournalListResponse {
  items: JournalMessageDTO[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface JournalDayDTO {
  day: string
  count: number
}

export interface AttachmentLocalizationResult {
  totalMessages: number
  totalAttachments: number
  downloaded: number
  skipped: number
  failed: { messageId: string; url: string; error: string }[]
}

function toIsoDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined
  return new Date(value).toISOString()
}

function toLocalAttachmentDTO(attachment: JournalLocalAttachment): JournalAttachmentDTO {
  return {
    originalUrl: attachment.originalUrl,
    url: attachment.url,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
  }
}

function toRemoteAttachmentDTO(url: string): JournalAttachmentDTO {
  return {
    originalUrl: url,
    url,
    fileName: urlToDisplayName(url),
  }
}

export function toJournalMessageDTO(message: JournalMessageDocument): JournalMessageDTO {
  const localByOriginal = new Map(
    (message.localAttachments ?? []).map(attachment => [attachment.originalUrl, attachment]),
  )
  const attachmentDTOs = (message.attachments ?? []).map(url => {
    const local = localByOriginal.get(url)
    return local ? toLocalAttachmentDTO(local) : toRemoteAttachmentDTO(url)
  })

  return {
    id: message._id,
    messageId: message.messageId,
    author: message.author,
    timestamp: message.timestamp.toISOString(),
    content: message.content,
    attachments: attachmentDTOs,
    hasAttachments: attachmentDTOs.length > 0,
    pinned: message.pinned === true,
    pinnedAt: toIsoDate(message.pinnedAt),
    createdAt: toIsoDate(message.createdAt),
    updatedAt: toIsoDate(message.updatedAt),
  }
}

export async function listPinnedJournalMessages(): Promise<JournalMessageDTO[]> {
  const docs = await getJournalMessagesCollection()
    .find({ pinned: true })
    .sort({ pinnedAt: -1, timestamp: -1 })
    .toArray()
  return docs.map(toJournalMessageDTO)
}

export async function pinJournalMessage(id: string): Promise<JournalMessageDTO | null> {
  const now = new Date()
  const result = await getJournalMessagesCollection().findOneAndUpdate(
    { _id: id },
    { $set: { pinned: true, pinnedAt: now, updatedAt: now } },
    { returnDocument: 'after' },
  )
  return result ? toJournalMessageDTO(result) : null
}

export async function unpinJournalMessage(id: string): Promise<JournalMessageDTO | null> {
  const now = new Date()
  const result = await getJournalMessagesCollection().findOneAndUpdate(
    { _id: id },
    { $set: { pinned: false, updatedAt: now }, $unset: { pinnedAt: '' } },
    { returnDocument: 'after' },
  )
  return result ? toJournalMessageDTO(result) : null
}

function localDayRange(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00.000+07:00`)
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  }
}

function localMonthRange(month: string): { start: Date; end: Date } {
  const [yearValue, monthValue] = month.split('-').map(value => Number.parseInt(value, 10))
  const nextMonth = monthValue === 12 ? 1 : monthValue + 1
  const nextYear = monthValue === 12 ? yearValue + 1 : yearValue
  const start = new Date(`${month}-01T00:00:00.000+07:00`)
  return {
    start,
    end: new Date(`${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000+07:00`),
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildJournalFilter(query: {
  q?: string
  day?: string
  after?: string
  before?: string
  month?: string
}): Filter<JournalMessageDocument> {
  const filter: Filter<JournalMessageDocument> = {}

  if (query.q?.trim()) {
    const q = query.q.trim()
    if (/^https?:\/\//i.test(q)) {
      const pattern = new RegExp(escapeRegExp(q), 'i')
      filter.$or = [
        { content: pattern },
        { attachments: pattern },
      ]
    } else {
      filter.$text = { $search: q }
    }
  }

  let timestampFilter: Filter<JournalMessageDocument>['timestamp'] | undefined

  if (query.day?.trim()) {
    const { start, end } = localDayRange(query.day.trim())
    timestampFilter = {
      $gte: start,
      $lt: end,
    } as Filter<JournalMessageDocument>['timestamp']
  } else if (query.month?.trim()) {
    const { start, end } = localMonthRange(query.month.trim())
    timestampFilter = {
      $gte: start,
      $lt: end,
    } as Filter<JournalMessageDocument>['timestamp']
  } else {
    const range: Record<string, Date> = {}

    if (query.after?.trim()) {
      range.$gte = localDayRange(query.after.trim()).start
    }

    if (query.before?.trim()) {
      range.$lt = localDayRange(query.before.trim()).end
    }

    if (Object.keys(range).length > 0) {
      timestampFilter = range as Filter<JournalMessageDocument>['timestamp']
    }
  }

  if (timestampFilter) {
    filter.timestamp = timestampFilter
  }

  return filter
}

export function createLocalMessageId(): string {
  return `local-${Date.now()}-${randomBytes(3).toString('hex')}`
}

function urlToDisplayName(value: string): string {
  try {
    const url = new URL(value)
    const name = url.pathname.split('/').pop()
    return decodeURIComponent(name || 'attachment')
  } catch {
    return 'attachment'
  }
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'attachment'
}

function extensionFromContentType(contentType: string | null): string {
  if (!contentType) return ''
  if (contentType.includes('jpeg')) return '.jpg'
  if (contentType.includes('png')) return '.png'
  if (contentType.includes('gif')) return '.gif'
  if (contentType.includes('webp')) return '.webp'
  if (contentType.includes('mp4')) return '.mp4'
  if (contentType.includes('webm')) return '.webm'
  return ''
}

function buildAttachmentFileName(messageId: string, index: number, originalUrl: string, contentType: string | null): string {
  const displayName = sanitizeFileName(urlToDisplayName(originalUrl))
  const hash = createHash('sha1').update(originalUrl).digest('hex').slice(0, 10)
  const parsedExt = extname(displayName)
  const ext = parsedExt || extensionFromContentType(contentType)
  const stem = parsedExt ? displayName.slice(0, -parsedExt.length) : displayName
  return `${messageId}-${index + 1}-${hash}-${stem}${ext}`
}

export async function resolveJournalAttachmentPath(attachmentDir: string, fileName: string): Promise<string | null> {
  const safeName = sanitizeFileName(fileName)
  if (safeName !== fileName) return null
  const filePath = join(attachmentDir, safeName)
  const root = await fs.realpath(attachmentDir).catch(async () => {
    await fs.mkdir(attachmentDir, { recursive: true })
    return fs.realpath(attachmentDir)
  })
  const parent = await fs.realpath(dirname(filePath)).catch(() => null)
  if (!parent || parent !== root) return null
  return filePath
}

async function downloadAttachment(
  attachmentDir: string,
  message: JournalMessageDocument,
  originalUrl: string,
  index: number,
): Promise<JournalLocalAttachment> {
  const response = await fetch(originalUrl)
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? undefined
  const fileName = buildAttachmentFileName(message.messageId, index, originalUrl, contentType ?? null)
  await fs.mkdir(attachmentDir, { recursive: true })
  const filePath = join(attachmentDir, fileName)
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(filePath))
  const stat = await fs.stat(filePath)

  return {
    originalUrl,
    fileName,
    url: `/api/journal/attachments/${encodeURIComponent(fileName)}`,
    contentType,
    sizeBytes: stat.size,
    downloadedAt: new Date(),
  }
}

export async function localizeJournalAttachments(attachmentDir: string): Promise<AttachmentLocalizationResult> {
  const col = getJournalMessagesCollection()
  const docs = await col.find({ hasAttachments: true }).sort({ timestamp: 1 }).toArray()
  const result: AttachmentLocalizationResult = {
    totalMessages: docs.length,
    totalAttachments: 0,
    downloaded: 0,
    skipped: 0,
    failed: [],
  }

  for (const message of docs) {
    const attachments = message.attachments ?? []
    const existing = new Map((message.localAttachments ?? []).map(item => [item.originalUrl, item]))
    const nextLocal = [...(message.localAttachments ?? [])]
    let changed = false

    for (const [index, originalUrl] of attachments.entries()) {
      result.totalAttachments += 1
      if (existing.has(originalUrl)) {
        result.skipped += 1
        continue
      }

      try {
        const local = await downloadAttachment(attachmentDir, message, originalUrl, index)
        nextLocal.push(local)
        existing.set(originalUrl, local)
        result.downloaded += 1
        changed = true
      } catch (err) {
        result.failed.push({
          messageId: message.messageId,
          url: originalUrl,
          error: err instanceof Error ? err.message : 'Download failed',
        })
      }
    }

    if (changed) {
      await col.updateOne(
        { _id: message._id },
        { $set: { localAttachments: nextLocal, updatedAt: new Date() } },
      )
    }
  }

  return result
}
