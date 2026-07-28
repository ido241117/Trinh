import { Router } from 'express'
import { randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import multer from 'multer'
import { getAiQuotaServicesCollection } from '../models/ai-quota.model.js'
import { computeCycleState } from '../services/ai-quota-cycle.js'
import type { AiQuotaServiceDocument, AiQuotaServiceDTO, DurationCycleRule, MonthlyDayCycleRule, WeeklyDayCycleRule, DateRangeCycleRule } from '../types.js'

async function toAiQuotaServiceDTO(doc: AiQuotaServiceDocument): Promise<AiQuotaServiceDTO> {
  const cycleState = computeCycleState(doc.cycleRule, doc.lastResetAt)
  const now = new Date()
  
  const lastResetTime = new Date(doc.lastResetAt).getTime()
  const prevResetTime = new Date(cycleState.prevResetAt).getTime()
  
  // Auto-reset exhausted nếu chu kỳ mới đã bắt đầu
  if (doc.exhausted && lastResetTime < prevResetTime) {
    const nowIso = now.toISOString()
    await getAiQuotaServicesCollection().updateOne(
      { _id: doc._id },
      { $set: { exhausted: false, lastResetAt: nowIso, updatedAt: nowIso } }
    )
    // Recalculate cycleState với lastResetAt mới
    const newCycleState = computeCycleState(doc.cycleRule, nowIso)
    const { prevResetAt: _, ...restNewCycleState } = newCycleState
    return {
      id: doc._id,
      name: doc.name,
      iconUrl: doc.iconUrl,
      cycleRule: doc.cycleRule,
      lastResetAt: nowIso,
      createdAt: doc.createdAt,
      updatedAt: nowIso,
      exhausted: false,
      ...restNewCycleState,
    }
  }
  
  const { prevResetAt: _, ...restCycleState } = cycleState
  return {
    id: doc._id,
    name: doc.name,
    iconUrl: doc.iconUrl,
    cycleRule: doc.cycleRule,
    lastResetAt: doc.lastResetAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    exhausted: doc.exhausted,
    ...restCycleState,
  }
}

function sanitizeUploadedExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  return /^[a-z0-9.]{1,12}$/.test(ext) ? ext : ''
}

function parseCycleRule(raw: unknown): DurationCycleRule | MonthlyDayCycleRule | WeeklyDayCycleRule | DateRangeCycleRule | null {
  let parsed: Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as Record<string, unknown>
  } else {
    return null
  }

  if (parsed.type === 'monthly-day') {
    if (typeof parsed.dayOfMonth !== 'number' || parsed.dayOfMonth < 1 || parsed.dayOfMonth > 31) return null
    return {
      type: 'monthly-day',
      dayOfMonth: parsed.dayOfMonth,
    }
  }

  if (parsed.type === 'weekly-day') {
    if (typeof parsed.dayOfWeek !== 'number' || parsed.dayOfWeek < 0 || parsed.dayOfWeek > 6) return null
    return {
      type: 'weekly-day',
      dayOfWeek: parsed.dayOfWeek,
    }
  }

  if (parsed.type === 'date-range') {
    if (typeof parsed.startDate !== 'string' || typeof parsed.endDate !== 'string') return null
    return {
      type: 'date-range',
      startDate: parsed.startDate,
      endDate: parsed.endDate,
    }
  }

  if (parsed.type !== 'duration') return null
  if (typeof parsed.value !== 'number' || parsed.value < 1) return null

  return {
    type: 'duration',
    value: parsed.value,
    anchorDate: typeof parsed.anchorDate === 'string' ? parsed.anchorDate : undefined,
  }
}

export function createAiQuotaRouter(iconDir: string) {
  const router = Router()

  // Ensure icon directory exists
  fs.mkdir(iconDir, { recursive: true }).catch(() => undefined)

  const iconUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdir(iconDir, { recursive: true })
          .then(() => cb(null, iconDir))
          .catch(err => cb(err, iconDir))
      },
      filename: (_req, file, cb) => {
        const ext = sanitizeUploadedExt(file.originalname)
        cb(null, `${randomBytes(16).toString('hex')}${ext}`)
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
      cb(null, allowedMimes.includes(file.mimetype))
    },
  })

  // GET / - List all services
  router.get('/', async (_req, res) => {
    try {
      const col = getAiQuotaServicesCollection()
      const docs = await col.find().sort({ createdAt: -1 }).toArray()
      const dtos = await Promise.all(docs.map(toAiQuotaServiceDTO))
      res.json(dtos)
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch AI quota services' })
    }
  })

  // GET /icons/:filename - Serve icon (must be before /:id)
  router.get('/icons/:filename', async (req, res) => {
    try {
      const filePath = path.join(iconDir, req.params.filename)
      res.set({ 'Cache-Control': 'private, max-age=31536000, immutable' })
      res.sendFile(filePath, err => {
        if (err && !res.headersSent) res.status(404).json({ error: 'Icon not found' })
      })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch icon' })
    }
  })

  // GET /:id - Get single service
  router.get('/:id', async (req, res) => {
    try {
      const doc = await getAiQuotaServicesCollection().findOne({ _id: req.params.id })
      if (!doc) {
        res.status(404).json({ error: 'AI quota service not found' })
        return
      }
      res.json(await toAiQuotaServiceDTO(doc))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch AI quota service' })
    }
  })

  // POST / - Create new service
  router.post('/', iconUpload.single('icon'), async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''

    if (!name || name.length < 1 || name.length > 100) {
      res.status(400).json({ error: 'name is required and must be 1-100 characters' })
      return
    }

    const cycleRule = parseCycleRule(req.body?.cycleRule)
    if (!cycleRule?.type) {
      res.status(400).json({ error: 'Invalid cycleRule JSON' })
      return
    }

    try {
      const now = new Date()
      const iconFile = req.file
      const iconUrl = iconFile ? `/api/ai-quota/icons/${iconFile.filename}` : null

      const doc: AiQuotaServiceDocument = {
        _id: randomBytes(16).toString('hex'),
        name,
        iconUrl,
        cycleRule,
        lastResetAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        exhausted: false,
      }

      await getAiQuotaServicesCollection().insertOne(doc)
      res.status(201).json(await toAiQuotaServiceDTO(doc))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to create AI quota service' })
    }
  })

  // PUT /:id - Update service
  router.put('/:id', iconUpload.single('icon'), async (req, res) => {
    try {
      const existing = await getAiQuotaServicesCollection().findOne({ _id: req.params.id })
      if (!existing) {
        res.status(404).json({ error: 'AI quota service not found' })
        return
      }

      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined

      const patch: Partial<AiQuotaServiceDocument> = { updatedAt: new Date().toISOString() }

      if (name !== undefined) {
        if (name.length < 1 || name.length > 100) {
          res.status(400).json({ error: 'name must be 1-100 characters' })
          return
        }
        patch.name = name
      }

      if (req.body?.cycleRule !== undefined) {
        const cycleRule = parseCycleRule(req.body.cycleRule)
        if (!cycleRule?.type) {
          res.status(400).json({ error: 'Invalid cycleRule JSON' })
          return
        }
        patch.cycleRule = cycleRule
      }

      const iconFile = req.file
      if (iconFile) {
        // Delete old icon if exists
        if (existing.iconUrl) {
          const oldFileName = existing.iconUrl.split('/').pop()
          if (oldFileName) {
            const oldPath = path.join(iconDir, oldFileName)
            fs.unlink(oldPath).catch(() => undefined)
          }
        }
        patch.iconUrl = `/api/ai-quota/icons/${iconFile.filename}`
      }

      const result = await getAiQuotaServicesCollection().findOneAndUpdate(
        { _id: req.params.id },
        { $set: patch },
        { returnDocument: 'after' },
      )

      if (!result) {
        res.status(404).json({ error: 'AI quota service not found' })
        return
      }

      res.json(await toAiQuotaServiceDTO(result))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to update AI quota service' })
    }
  })

  // DELETE /:id - Delete service
  router.delete('/:id', async (req, res) => {
    try {
      const existing = await getAiQuotaServicesCollection().findOne({ _id: req.params.id })
      if (!existing) {
        res.status(404).json({ error: 'AI quota service not found' })
        return
      }

      // Delete icon if exists
      if (existing.iconUrl) {
        const fileName = existing.iconUrl.split('/').pop()
        if (fileName) {
          const iconPath = path.join(iconDir, fileName)
          fs.unlink(iconPath).catch(() => undefined)
        }
      }

      const result = await getAiQuotaServicesCollection().deleteOne({ _id: req.params.id })
      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'AI quota service not found' })
        return
      }

      res.json({ success: true })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to delete AI quota service' })
    }
  })

  // POST /:id/reset - Manual reset
  router.post('/:id/reset', async (req, res) => {
    try {
      const now = new Date()
      const result = await getAiQuotaServicesCollection().findOneAndUpdate(
        { _id: req.params.id },
        { $set: { lastResetAt: now.toISOString(), updatedAt: now.toISOString() } },
        { returnDocument: 'after' },
      )

      if (!result) {
        res.status(404).json({ error: 'AI quota service not found' })
        return
      }

      res.json(await toAiQuotaServiceDTO(result))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to reset AI quota service' })
    }
  })

  // PATCH /:id/exhausted - Toggle service exhausted status
  router.patch('/:id/exhausted', async (req, res) => {
    try {
      const exhausted = req.body?.exhausted
      if (typeof exhausted !== 'boolean') {
        res.status(400).json({ error: 'exhausted must be a boolean' })
        return
      }
      const result = await getAiQuotaServicesCollection().findOneAndUpdate(
        { _id: req.params.id },
        { $set: { exhausted, updatedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )
      if (!result) {
        res.status(404).json({ error: 'AI quota service not found' })
        return
      }
      res.json(await toAiQuotaServiceDTO(result))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to update exhausted status' })
    }
  })

  return router
}
