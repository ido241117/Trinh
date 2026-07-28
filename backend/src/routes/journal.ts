import { Router } from 'express'
import fs from 'fs/promises'
import { randomBytes } from 'crypto'
import { extname, join } from 'path'
import multer from 'multer'
import {
  buildJournalFilter,
  createLocalMessageId,
  listPinnedJournalMessages,
  pinJournalMessage,
  resolveJournalAttachmentPath,
  toJournalMessageDTO,
  unpinJournalMessage,
} from '../services/journal.js'
import { fetchYoutubeLinkMetadata } from '../services/youtube-service.js'
import { getJournalMessagesCollection } from '../models/journal.model.js'
import type { JournalLocalAttachment } from '../models/journal.model.js'

function parsePage(value: unknown): number {
  const page = Number.parseInt(String(value ?? '1'), 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

function parseLimit(value: unknown): number {
  const limit = Number.parseInt(String(value ?? '50'), 10)
  if (!Number.isFinite(limit) || limit < 1) return 50
  return Math.min(limit, 3000)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readTimestamp(value: unknown): Date {
  if (typeof value !== 'string' || !value.trim()) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function parseRemoveAttachments(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map(item => item.trim())
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map(item => item.trim())
      }
    } catch {
      return [value.trim()]
    }
  }

  return []
}

function buildUploadedAttachments(files: Express.Multer.File[], now = new Date()): JournalLocalAttachment[] {
  return files.map(file => {
    const originalUrl = `local-upload:${file.filename}`
    return {
      originalUrl,
      fileName: file.filename,
      url: `/api/journal/attachments/${encodeURIComponent(file.filename)}`,
      contentType: file.mimetype,
      sizeBytes: file.size,
      downloadedAt: now,
    }
  })
}

function sanitizeUploadedExt(fileName: string): string {
  const ext = extname(fileName).toLowerCase()
  return /^[a-z0-9.]{1,12}$/.test(ext) ? ext : ''
}

export function createJournalRouter(attachmentDir: string) {
  const router = Router()
  const imageUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdir(attachmentDir, { recursive: true })
          .then(() => cb(null, attachmentDir))
          .catch(err => cb(err, attachmentDir))
      },
      filename: (_req, file, cb) => {
        const ext = sanitizeUploadedExt(file.originalname)
        cb(null, `upload-${Date.now()}-${randomBytes(6).toString('hex')}${ext}`)
      },
    }),
    limits: { fileSize: 20 * 1024 * 1024, files: 20 },
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype.startsWith('image/'))
    },
  })

  router.get('/messages', async (req, res) => {
    try {
      const page = parsePage(req.query.page)
      const limit = parseLimit(req.query.limit)
      const q = readString(req.query.q)
      const day = readString(req.query.day)
      const after = readString(req.query.after)
      const before = readString(req.query.before)
      const month = readString(req.query.month)
      const filter = buildJournalFilter({ q, day, after, before, month })
      const col = getJournalMessagesCollection()
      const [docs, total] = await Promise.all([
        col.find(filter).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
        col.countDocuments(filter),
      ])

      res.json({
        items: docs.map(toJournalMessageDTO),
        total,
        page,
        limit,
        hasMore: page * limit < total,
      })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch journal messages' })
    }
  })

  router.get('/messages/pinned', async (_req, res) => {
    try {
      const items = await listPinnedJournalMessages()
      res.json({ items })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch pinned journal messages' })
    }
  })

  router.post('/messages/:id/pin', async (req, res) => {
    try {
      const result = await pinJournalMessage(req.params.id)
      if (!result) {
        res.status(404).json({ error: 'Journal message not found' })
        return
      }
      res.json(result)
    } catch (_err) {
      res.status(500).json({ error: 'Failed to pin journal message' })
    }
  })

  router.delete('/messages/:id/pin', async (req, res) => {
    try {
      const result = await unpinJournalMessage(req.params.id)
      if (!result) {
        res.status(404).json({ error: 'Journal message not found' })
        return
      }
      res.json(result)
    } catch (_err) {
      res.status(500).json({ error: 'Failed to unpin journal message' })
    }
  })

  router.get('/messages/:id', async (req, res) => {
    try {
      const doc = await getJournalMessagesCollection().findOne({ _id: req.params.id })
      if (!doc) {
        res.status(404).json({ error: 'Journal message not found' })
        return
      }
      res.json(toJournalMessageDTO(doc))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch journal message' })
    }
  })

  router.post('/messages', imageUpload.array('images', 20), async (req, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    const author = typeof req.body?.author === 'string' && req.body.author.trim()
      ? req.body.author.trim()
      : 'Local'
    const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : []

    if (!content && files.length === 0) {
      res.status(400).json({ error: 'content or image is required' })
      return
    }

    try {
      const messageId = createLocalMessageId()
      const now = new Date()
      const localAttachments = buildUploadedAttachments(files, now)
      const doc = {
        _id: messageId,
        messageId,
        channelName: 'Local Journal',
        author,
        timestamp: readTimestamp(req.body?.timestamp),
        content,
        attachments: localAttachments.map(attachment => attachment.originalUrl),
        localAttachments,
        hasAttachments: localAttachments.length > 0,
        createdAt: now,
        updatedAt: now,
        source: { importer: 'local-journal-ui' },
      }

      await getJournalMessagesCollection().insertOne(doc)
      res.status(201).json(toJournalMessageDTO(doc))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to create journal message' })
    }
  })

  router.patch('/messages/:id', imageUpload.array('images', 20), async (req, res) => {
    try {
      const existing = await getJournalMessagesCollection().findOne({ _id: req.params.id })
      if (!existing) {
        res.status(404).json({ error: 'Journal message not found' })
        return
      }

      const now = new Date()
      const patch: Record<string, unknown> = { updatedAt: now }
      let content = existing.content
      let attachments = [...(existing.attachments ?? [])]
      let localAttachments = [...(existing.localAttachments ?? [])]

      if (typeof req.body?.content === 'string') content = req.body.content.trim()
      if (typeof req.body?.author === 'string' && req.body.author.trim()) patch.author = req.body.author.trim()
      if (typeof req.body?.timestamp === 'string' && req.body.timestamp.trim()) {
        patch.timestamp = readTimestamp(req.body.timestamp)
      }

      const removeAttachments = parseRemoveAttachments(req.body?.removeAttachments)
      if (removeAttachments.length > 0) {
        const removeSet = new Set(removeAttachments)
        const removedLocal = localAttachments.filter(attachment => removeSet.has(attachment.originalUrl))
        attachments = attachments.filter(url => !removeSet.has(url))
        localAttachments = localAttachments.filter(attachment => !removeSet.has(attachment.originalUrl))

        await Promise.all(removedLocal.map(async attachment => {
          if (!attachment.originalUrl.startsWith('local-upload:')) return
          const filePath = await resolveJournalAttachmentPath(attachmentDir, attachment.fileName)
          if (!filePath) return
          await fs.unlink(filePath).catch(() => undefined)
        }))
      }

      const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : []
      const uploadedAttachments = buildUploadedAttachments(files, now)
      if (uploadedAttachments.length > 0) {
        attachments.push(...uploadedAttachments.map(attachment => attachment.originalUrl))
        localAttachments.push(...uploadedAttachments)
      }

      if (!content && attachments.length === 0) {
        res.status(400).json({ error: 'content or attachment is required' })
        return
      }

      patch.content = content
      patch.attachments = attachments
      patch.localAttachments = localAttachments
      patch.hasAttachments = attachments.length > 0

      const result = await getJournalMessagesCollection().findOneAndUpdate(
        { _id: req.params.id },
        { $set: patch },
        { returnDocument: 'after' },
      )
      if (!result) {
        res.status(404).json({ error: 'Journal message not found' })
        return
      }
      res.json(toJournalMessageDTO(result))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to update journal message' })
    }
  })

  router.delete('/messages/:id', async (req, res) => {
    try {
      const result = await getJournalMessagesCollection().deleteOne({ _id: req.params.id })
      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'Journal message not found' })
        return
      }
      res.json({ success: true })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to delete journal message' })
    }
  })

  router.get('/days', async (_req, res) => {
    try {
      const items = await getJournalMessagesCollection()
        .aggregate<{ day: string; count: number }>([
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$timestamp',
                  timezone: 'Asia/Ho_Chi_Minh',
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
          { $project: { _id: 0, day: '$_id', count: 1 } },
        ])
        .toArray()
      res.json({ items })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch journal days' })
    }
  })

  router.post('/youtube-metadata', async (req, res) => {
    const url = readString(req.body?.url)
    if (!url) {
      res.status(400).json({ error: 'url is required' })
      return
    }

    try {
      const metadata = await fetchYoutubeLinkMetadata(url)
      if (!metadata) {
        res.status(400).json({ error: 'Invalid YouTube URL' })
        return
      }
      res.json(metadata)
    } catch (_err) {
      res.status(504).json({ error: 'Failed to fetch YouTube metadata' })
    }
  })

  router.get('/attachments/:fileName', async (req, res) => {
    try {
      const filePath = await resolveJournalAttachmentPath(attachmentDir, req.params.fileName)
      if (!filePath) {
        res.status(400).json({ error: 'Invalid attachment path' })
        return
      }

      res.set({ 'Cache-Control': 'private, max-age=31536000, immutable' })
      res.sendFile(filePath, err => {
        if (err && !res.headersSent) res.status(404).json({ error: 'Attachment not found' })
      })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch attachment' })
    }
  })

  return router
}
