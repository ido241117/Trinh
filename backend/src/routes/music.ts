import { Router, Request } from 'express'
import fs, { createReadStream } from 'fs'
import { mkdir, readdir, unlink, stat } from 'fs/promises'
import { extname, dirname, join } from 'path'
import { tmpdir } from 'os'
import multer from 'multer'
import NodeID3 from 'node-id3'
import sharp from 'sharp'
import {
  processCover,
  readAudioDuration,
  replaceFileWithMtime,
  scanMusicFolder,
  trimMp3,
  withMtimePreserved,
} from '../services/music-service.js'
import {
  buildLibraryMongoFilter,
  buildLibraryMongoSort,
  parseLibraryQueryParams,
  trackDocumentToDTO,
} from '../services/library-query.js'
import { getTrackCollection } from '../models/track.model.js'
import type { Track } from '../types.js'

const INVALID_CHARS = /[\\/:*?"<>|]/

const MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
}

const upload = multer({
  storage: multer.diskStorage({ destination: tmpdir() }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png'].includes(file.mimetype))
  },
})

function toDTO(track: Track) {
  const { absolutePath: _, ...dto } = track
  return dto
}

export function createMusicRouter(musicFolder: string, imgDir: string) {
  const router = Router()

  // ── Library ──────────────────────────────────────────────────────────────

  // GET /api/library — load from MongoDB (no file scan)
  // Optional query: limit, offset, sort, order, search, filter, month
  router.get('/library', async (req, res) => {
    try {
      const params = parseLibraryQueryParams(req.query as Record<string, unknown>)
      const col = getTrackCollection()
      const mongoFilter = buildLibraryMongoFilter(params)
      const mongoSort = buildLibraryMongoSort(params.sort, params.order)

      if (params.limit !== undefined) {
        const offset = params.offset ?? 0
        const [docs, total] = await Promise.all([
          col.find(mongoFilter).sort(mongoSort).skip(offset).limit(params.limit).toArray(),
          col.countDocuments(mongoFilter),
        ])
        const items = docs.map(trackDocumentToDTO)
        res.json({
          items,
          total,
          offset,
          limit: params.limit,
          hasMore: offset + items.length < total,
        })
        return
      }

      const docs = await col.find(mongoFilter).sort(mongoSort).toArray()
      res.json(docs.map(trackDocumentToDTO))
    } catch (err) {
      res.status(500).json({ error: 'Failed to read library from database' })
    }
  })

  // POST /api/library/scan — scan files → process covers → upsert MongoDB → return DTOs
  router.post('/library/scan', async (_req, res) => {
    try {
      await mkdir(imgDir, { recursive: true })
      const existingFiles = await readdir(imgDir)
      await Promise.all(
        existingFiles
          .filter(f => f.endsWith('.jpg'))
          .map(f => unlink(join(imgDir, f)))
      )

      const tracks = await scanMusicFolder(musicFolder)

      const tracksWithCovers = await Promise.all(
        tracks.map(async track => ({
          ...track,
          coverFile: track.hasCover
            ? await processCover(track.absolutePath, imgDir, track.id)
            : null,
        }))
      )

      const col = getTrackCollection()
      const scannedAt = new Date().toISOString()
      const docs = tracksWithCovers.map(track => {
        const { id, ...rest } = track
        return { _id: id, scannedAt, ...rest }
      })
      await col.deleteMany({})
      await col.insertMany(docs)
      res.json(tracksWithCovers.map(toDTO))
    } catch (err) {
      res.status(500).json({ error: 'Failed to scan music folder' })
    }
  })

  // PATCH /api/library/:id/rename
  router.patch('/library/:id/rename', async (req, res) => {
    const { newFilename } = req.body

    if (!newFilename || INVALID_CHARS.test(newFilename)) {
      res.status(400).json({ error: 'Invalid filename: empty or contains forbidden characters' })
      return
    }

    const doc = await getTrackCollection().findOne({ _id: req.params.id } as never)
    if (!doc) {
      res.status(404).json({ error: 'Track not found' })
      return
    }

    if (extname(doc.absolutePath).toLowerCase() !== '.mp3') {
      res.status(400).json({ error: 'Only .mp3 files are supported' })
      return
    }

    const newAbsolutePath = join(dirname(doc.absolutePath), `${newFilename}.mp3`)

    if (fs.existsSync(newAbsolutePath)) {
      res.status(409).json({ error: 'A file with that name already exists' })
      return
    }

    try {
      await withMtimePreserved(doc.absolutePath, newAbsolutePath, async () => {
        // no-op: content unchanged, destPath handles the rename
      })

      await getTrackCollection().updateOne(
        { _id: req.params.id } as never,
        { $set: { absolutePath: newAbsolutePath, filename: newFilename } } as never
      )

      const { _id, absolutePath: _, scannedAt: __, ...rest } = doc
      res.json({ id: _id, ...rest, filename: newFilename })
    } catch {
      res.status(500).json({ error: 'Rename failed' })
    }
  })

  // PATCH /api/library/:id/artist
  // Empty/blank artist removes the artist tag (clears it back to "no artist").
  router.patch('/library/:id/artist', async (req, res) => {
    const trimmed = typeof req.body.artist === 'string' ? req.body.artist.trim() : ''

    const doc = await getTrackCollection().findOne({ _id: req.params.id } as never)
    if (!doc) {
      res.status(404).json({ error: 'Track not found' })
      return
    }

    if (extname(doc.absolutePath).toLowerCase() !== '.mp3') {
      res.status(400).json({ error: 'Only .mp3 files are supported' })
      return
    }

    try {
      await withMtimePreserved(doc.absolutePath, doc.absolutePath, async (tempPath) => {
        // node-id3 merges tags: an empty artist drops the existing TPE1 frame
        // while leaving every other tag (title, album, cover, ...) untouched.
        const result = NodeID3.update({ artist: trimmed }, tempPath)
        if (result !== true) {
          const msg = result instanceof Error ? result.message : 'node-id3 update failed'
          throw new Error(msg)
        }
      })

      if (trimmed) {
        await getTrackCollection().updateOne(
          { _id: req.params.id } as never,
          { $set: { artist: trimmed } } as never
        )
      } else {
        await getTrackCollection().updateOne(
          { _id: req.params.id } as never,
          { $unset: { artist: '' } } as never
        )
      }

      const { _id, absolutePath: _, scannedAt: __, ...rest } = doc
      if (!trimmed) {
        const { artist: _removed, ...restNoArtist } = rest
        res.json({ id: _id, ...restNoArtist })
      } else {
        res.json({ id: _id, ...rest, artist: trimmed })
      }
    } catch {
      res.status(500).json({ error: 'Artist update failed' })
    }
  })

  // PATCH /api/library/:id/trim
  router.patch('/library/:id/trim', async (req, res) => {
    const startSec = req.body?.startSec
    const endSec = req.body?.endSec

    if (typeof startSec !== 'number' || !Number.isFinite(startSec) || startSec < 0) {
      res.status(400).json({ error: 'Invalid startSec: must be a non-negative number' })
      return
    }
    if (typeof endSec !== 'number' || !Number.isFinite(endSec) || endSec <= startSec) {
      res.status(400).json({ error: 'Invalid endSec: must be greater than startSec' })
      return
    }

    const doc = await getTrackCollection().findOne({ _id: req.params.id } as never)
    if (!doc) {
      res.status(404).json({ error: 'Track not found' })
      return
    }

    if (extname(doc.absolutePath).toLowerCase() !== '.mp3') {
      res.status(400).json({ error: 'Only .mp3 files are supported' })
      return
    }

    if (doc.duration > 0 && endSec > doc.duration) {
      res.status(400).json({ error: `endSec must not exceed track duration (${doc.duration}s)` })
      return
    }

    try {
      await withMtimePreserved(doc.absolutePath, doc.absolutePath, async (tempPath) => {
        await trimMp3(tempPath, startSec, endSec)
      })

      const duration = await readAudioDuration(doc.absolutePath)

      await getTrackCollection().updateOne(
        { _id: req.params.id } as never,
        { $set: { duration } } as never,
      )

      const { _id, absolutePath: _, scannedAt: __, ...rest } = doc
      res.json({ id: _id, ...rest, duration })
    } catch {
      res.status(500).json({ error: 'Trim failed' })
    }
  })

  // PATCH /api/library/:id/dateModified
  router.patch('/library/:id/dateModified', async (req, res) => {
    const raw = req.body?.dateModified
    if (typeof raw !== 'string' || !raw.trim()) {
      res.status(400).json({ error: 'Invalid dateModified: must be a non-empty ISO date string' })
      return
    }

    const newMtime = new Date(raw)
    if (Number.isNaN(newMtime.getTime())) {
      res.status(400).json({ error: 'Invalid dateModified: not a valid date' })
      return
    }

    const doc = await getTrackCollection().findOne({ _id: req.params.id } as never)
    if (!doc) {
      res.status(404).json({ error: 'Track not found' })
      return
    }

    if (extname(doc.absolutePath).toLowerCase() !== '.mp3') {
      res.status(400).json({ error: 'Only .mp3 files are supported' })
      return
    }

    try {
      await replaceFileWithMtime(doc.absolutePath, newMtime)

      const dateModified = newMtime.toISOString()
      await getTrackCollection().updateOne(
        { _id: req.params.id } as never,
        { $set: { dateModified } } as never,
      )

      const { _id, absolutePath: _, scannedAt: __, ...rest } = doc
      res.json({ id: _id, ...rest, dateModified })
    } catch {
      res.status(500).json({ error: 'Date modified update failed' })
    }
  })

  // POST /api/library/:id/cover  (multipart/form-data, field: "image")
  router.post(
    '/library/:id/cover',
    (req, res, next) => {
      upload.single('image')(req, res, (err) => {
        if (err?.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'File too large (max 5 MB)' })
          return
        }
        if (err) {
          res.status(400).json({ error: err.message })
          return
        }
        next()
      })
    },
    async (req: Request, res) => {
      const uploadedPath = (req.file as Express.Multer.File | undefined)?.path
      try {
        if (!req.file) {
          res.status(400).json({ error: 'Missing or invalid image file (jpeg/png only)' })
          return
        }

        const doc = await getTrackCollection().findOne({ _id: req.params.id } as never)
        if (!doc) {
          res.status(404).json({ error: 'Track not found' })
          return
        }

        if (extname(doc.absolutePath).toLowerCase() !== '.mp3') {
          res.status(400).json({ error: 'Only .mp3 files are supported' })
          return
        }

        const imageBuffer = fs.readFileSync(req.file.path)
        const { mimetype } = req.file

        await withMtimePreserved(doc.absolutePath, doc.absolutePath, async (tempPath) => {
          const result = NodeID3.update(
            {
              image: {
                mime: mimetype,
                type: { id: 3, name: 'Cover (front)' },
                description: 'Cover',
                imageBuffer,
              },
            },
            tempPath
          )
          if (result !== true) {
            const msg = result instanceof Error ? result.message : 'node-id3 update failed'
            throw new Error(msg)
          }
        })

        const coverFilename = `${req.params.id}.jpg`
        await sharp(imageBuffer)
          .resize(100, 100)
          .jpeg({ quality: 85 })
          .toFile(join(imgDir, coverFilename))

        await getTrackCollection().updateOne(
          { _id: req.params.id } as never,
          { $set: { coverFile: coverFilename, hasCover: true } } as never
        )

        const { _id, absolutePath: _, scannedAt: __, ...rest } = doc
        res.json({ id: _id, ...rest, hasCover: true, coverFile: coverFilename })
      } catch {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Cover update failed' })
        }
      } finally {
        if (uploadedPath && fs.existsSync(uploadedPath)) {
          fs.unlinkSync(uploadedPath)
        }
      }
    }
  )

  // DELETE /api/library/:id — delete file, cover, and DB record
  router.delete('/library/:id', async (req, res) => {
    try {
      const col = getTrackCollection()
      const doc = await col.findOne({ _id: req.params.id } as never)

      if (!doc) {
        res.status(404).json({ error: 'Track not found' })
        return
      }

      try {
        await unlink(doc.absolutePath)
      } catch (err) {
        console.warn(`Failed to delete audio file: ${doc.absolutePath}`, err)
      }

      if (doc.coverFile) {
        try {
          const coverPath = join(imgDir, doc.coverFile)
          await unlink(coverPath)
        } catch (err) {
          console.warn(`Failed to delete cover file: ${doc.coverFile}`, err)
        }
      }

      await col.deleteOne({ _id: req.params.id } as never)

      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete track' })
    }
  })

  // ── Stream ───────────────────────────────────────────────────────────────

  // GET /api/stream/:id
  router.get('/stream/:id', async (req, res) => {
    const doc = await getTrackCollection().findOne({ _id: req.params.id } as never)
    if (!doc) {
      res.status(404).json({ error: 'Track not found' })
      return
    }

    let fileSize: number
    try {
      const fileStat = await stat(doc.absolutePath)
      fileSize = fileStat.size
    } catch {
      res.status(404).json({ error: 'File not found on disk' })
      return
    }

    const contentType = MIME_TYPES[doc.format] ?? 'audio/mpeg'
    const rangeHeader = req.headers.range

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-')
      const start = parseInt(startStr, 10)
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1
      const chunkSize = end - start + 1

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      })
      createReadStream(doc.absolutePath, { start, end }).pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      })
      createReadStream(doc.absolutePath).pipe(res)
    }
  })

  // ── Cover ────────────────────────────────────────────────────────────────

  // GET /api/cover/:id
  router.get('/cover/:id', async (req, res) => {
    const doc = await getTrackCollection().findOne({ _id: req.params.id } as never)
    if (!doc) {
      res.status(404).json({ error: 'Track not found' })
      return
    }

    if (!doc.coverFile) {
      res.status(404).json({ error: 'No cover art' })
      return
    }

    const filePath = join(imgDir, doc.coverFile)
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'max-age=86400',
    })
    res.sendFile(filePath)
  })

  return router
}
