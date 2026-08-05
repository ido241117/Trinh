import { Router } from 'express'
import { randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import multer from 'multer'
import { getAccountsCollection } from '../models/accounts.model.js'
import type { AccountDocument, AccountDTO } from '../types.js'

function toAccountDTO(doc: AccountDocument): AccountDTO {
  return {
    id: doc._id,
    name: doc.name,
    account: doc.account,
    password: doc.password,
    logoUrl: doc.logoUrl,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function sanitizeUploadedExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  return /^[a-z0-9.]{1,12}$/.test(ext) ? ext : ''
}

function readTrimmedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLen) return null
  return trimmed
}

export function createAccountsRouter(logoDir: string) {
  const router = Router()

  fs.mkdir(logoDir, { recursive: true }).catch(() => undefined)

  const logoUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdir(logoDir, { recursive: true })
          .then(() => cb(null, logoDir))
          .catch(err => cb(err, logoDir))
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

  router.get('/', async (_req, res) => {
    try {
      const docs = await getAccountsCollection().find().sort({ name: 1 }).toArray()
      res.json(docs.map(toAccountDTO))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch accounts' })
    }
  })

  router.get('/logos/:filename', async (req, res) => {
    try {
      const filePath = path.join(logoDir, req.params.filename)
      res.set({ 'Cache-Control': 'private, max-age=31536000, immutable' })
      res.sendFile(filePath, err => {
        if (err && !res.headersSent) res.status(404).json({ error: 'Logo not found' })
      })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch logo' })
    }
  })

  router.get('/:id', async (req, res) => {
    try {
      const doc = await getAccountsCollection().findOne({ _id: req.params.id })
      if (!doc) {
        res.status(404).json({ error: 'Account not found' })
        return
      }
      res.json(toAccountDTO(doc))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to fetch account' })
    }
  })

  router.post('/', logoUpload.single('logo'), async (req, res) => {
    const name = readTrimmedString(req.body?.name, 120)
    const account = readTrimmedString(req.body?.account, 200)
    const password = typeof req.body?.password === 'string' ? req.body.password : null

    if (!name) {
      res.status(400).json({ error: 'name is required and must be 1-120 characters' })
      return
    }
    if (!account) {
      res.status(400).json({ error: 'account is required and must be 1-200 characters' })
      return
    }
    if (password === null || password.length > 500) {
      res.status(400).json({ error: 'password is required and must be at most 500 characters' })
      return
    }

    try {
      const now = new Date().toISOString()
      const logoFile = req.file
      const doc: AccountDocument = {
        _id: randomBytes(16).toString('hex'),
        name,
        account,
        password,
        logoUrl: logoFile ? `/api/accounts/logos/${logoFile.filename}` : null,
        createdAt: now,
        updatedAt: now,
      }

      await getAccountsCollection().insertOne(doc)
      res.status(201).json(toAccountDTO(doc))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to create account' })
    }
  })

  router.put('/:id', logoUpload.single('logo'), async (req, res) => {
    try {
      const existing = await getAccountsCollection().findOne({ _id: req.params.id })
      if (!existing) {
        res.status(404).json({ error: 'Account not found' })
        return
      }

      const patch: Partial<AccountDocument> = { updatedAt: new Date().toISOString() }

      if (req.body?.name !== undefined) {
        const name = readTrimmedString(req.body.name, 120)
        if (!name) {
          res.status(400).json({ error: 'name must be 1-120 characters' })
          return
        }
        patch.name = name
      }

      if (req.body?.account !== undefined) {
        const account = readTrimmedString(req.body.account, 200)
        if (!account) {
          res.status(400).json({ error: 'account must be 1-200 characters' })
          return
        }
        patch.account = account
      }

      if (req.body?.password !== undefined) {
        if (typeof req.body.password !== 'string' || req.body.password.length > 500) {
          res.status(400).json({ error: 'password must be at most 500 characters' })
          return
        }
        patch.password = req.body.password
      }

      const logoFile = req.file
      if (logoFile) {
        if (existing.logoUrl) {
          const oldFileName = existing.logoUrl.split('/').pop()
          if (oldFileName) {
            fs.unlink(path.join(logoDir, oldFileName)).catch(() => undefined)
          }
        }
        patch.logoUrl = `/api/accounts/logos/${logoFile.filename}`
      }

      const result = await getAccountsCollection().findOneAndUpdate(
        { _id: req.params.id },
        { $set: patch },
        { returnDocument: 'after' },
      )

      if (!result) {
        res.status(404).json({ error: 'Account not found' })
        return
      }

      res.json(toAccountDTO(result))
    } catch (_err) {
      res.status(500).json({ error: 'Failed to update account' })
    }
  })

  router.delete('/:id', async (req, res) => {
    try {
      const existing = await getAccountsCollection().findOne({ _id: req.params.id })
      if (!existing) {
        res.status(404).json({ error: 'Account not found' })
        return
      }

      if (existing.logoUrl) {
        const fileName = existing.logoUrl.split('/').pop()
        if (fileName) {
          fs.unlink(path.join(logoDir, fileName)).catch(() => undefined)
        }
      }

      const result = await getAccountsCollection().deleteOne({ _id: req.params.id })
      if (result.deletedCount === 0) {
        res.status(404).json({ error: 'Account not found' })
        return
      }

      res.json({ success: true })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to delete account' })
    }
  })

  return router
}
