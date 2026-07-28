import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { Router } from 'express'
import multer from 'multer'
import {
  DASHBOARD_CONFIG,
  dashboardBackgroundFileName,
  isDashboardBackgroundFileName,
} from '../config/dashboard.js'
import type { DashboardBackgroundTheme } from '../models/dashboard.model.js'
import {
  clearDashboardBackground,
  getDashboardBackgroundMime,
  getDashboardSettings,
  setDashboardBackground,
} from '../services/dashboard.js'

function mimeTypeForFileName(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function parseBackgroundTheme(value: string): DashboardBackgroundTheme | null {
  return value === 'dark' || value === 'light' || value === 'mobile' ? value : null
}

export function createDashboardRouter(backgroundDir = DASHBOARD_CONFIG.backgroundDir) {
  const router = Router()

  fs.mkdir(backgroundDir, { recursive: true }).catch(() => undefined)

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: DASHBOARD_CONFIG.maxUploadBytes },
    fileFilter: (_req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
      cb(null, allowedMimes.includes(file.mimetype))
    },
  })

  router.get('/', async (_req, res) => {
    try {
      res.json(await getDashboardSettings())
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch dashboard settings' })
    }
  })

  router.get('/background/:filename', async (req, res) => {
    const fileName = req.params.filename
    if (!isDashboardBackgroundFileName(fileName)) {
      res.status(404).json({ error: 'Background image not found' })
      return
    }

    const filePath = path.join(backgroundDir, fileName)
    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'Background image not found' })
      return
    }

    const theme = fileName.replace(/\.png$/i, '') as DashboardBackgroundTheme
    const storedMime = await getDashboardBackgroundMime(theme).catch(() => null)

    res.set({
      'Content-Type': storedMime || mimeTypeForFileName(fileName),
      // Fixed filenames — browsers must revalidate; FE also cache-busts with ?v=
      'Cache-Control': 'private, max-age=0, must-revalidate',
    })
    res.sendFile(filePath, err => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'Background image not found' })
      }
    })
  })

  router.put('/background/:theme', (req, res, next) => {
    upload.single('image')(req, res, err => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid upload' })
        return
      }
      next()
    })
  }, async (req, res) => {
    const theme = parseBackgroundTheme(req.params.theme)
    if (!theme) {
      res.status(400).json({ error: 'theme must be dark, light, or mobile' })
      return
    }

    const file = req.file
    if (!file?.buffer?.length) {
      res.status(400).json({ error: 'image is required' })
      return
    }

    const fileName = dashboardBackgroundFileName(theme)
    const destPath = path.join(backgroundDir, fileName)

    try {
      await fs.mkdir(backgroundDir, { recursive: true })
      // Overwrite fixed name: remove then write (same path — no orphan random files)
      await fs.unlink(destPath).catch(() => undefined)
      await fs.writeFile(destPath, file.buffer)

      const result = await setDashboardBackground({
        theme,
        mimeType: file.mimetype || 'image/png',
      })
      res.json(result.settings)
    } catch (_err) {
      await fs.unlink(destPath).catch(() => undefined)
      res.status(500).json({ error: 'Failed to save dashboard background' })
    }
  })

  router.delete('/background/:theme', async (req, res) => {
    const theme = parseBackgroundTheme(req.params.theme)
    if (!theme) {
      res.status(400).json({ error: 'theme must be dark, light, or mobile' })
      return
    }

    try {
      const result = await clearDashboardBackground(theme)
      res.json(result.settings)
    } catch (_err) {
      res.status(500).json({ error: 'Failed to clear dashboard background' })
    }
  })

  return router
}
