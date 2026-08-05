import { existsSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Router } from 'express'
import multer from 'multer'
import {
  getColdStorageStatus,
  LOCAL_LIBRARY_CONFIG,
  refreshStorageMounts,
  resolveColdStorageMount,
} from '../config/local-library.js'
import {
  getLocalLibraryEpubCollection,
  getLocalLibraryHakoCollection,
  getLocalLibraryPdfCollection,
  parseLocalLibraryItemId,
} from '../models/local-library.model.js'
import {
  LocalLibraryFileError,
  LocalLibraryTocError,
  LocalLibraryUpdateError,
  clearLocalLibraryLastRead,
  getLocalLibraryBookToc,
  listLocalLibrary,
  normalizeLocalLibraryDocument,
  openLocalLibraryFile,
  openLocalLibraryFolder,
  toLocalLibraryDetailDTO,
  updateLocalLibraryLastRead,
  updateLocalLibraryReadingProgress,
} from '../services/book-read-service.js'
import {
  LocalLibraryImportError,
  deleteLocalLibraryBook,
  importLocalLibraryFromEpub,
  importLocalLibraryFromPdf,
  updateLocalLibraryBook,
} from '../services/book-import-service.js'

function isEpubUploadName(name: string): boolean {
  const baseName = name.split(/[/\\]/).pop() ?? name
  return baseName.toLowerCase().endsWith('.epub')
}

function isPdfUploadName(name: string): boolean {
  const baseName = name.split(/[/\\]/).pop() ?? name
  return baseName.toLowerCase().endsWith('.pdf')
}

function isSingleBookUploadName(name: string): boolean {
  return isEpubUploadName(name) || isPdfUploadName(name)
}

const bookFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  cb(null, isSingleBookUploadName(file.originalname))
}

const bookUpload = multer({
  storage: multer.diskStorage({ destination: tmpdir() }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: bookFileFilter,
})

function isCoverUploadName(name: string): boolean {
  const baseName = name.split(/[/\\]/).pop() ?? name
  return /\.(jpe?g|png|webp)$/i.test(baseName)
}

const coverFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  cb(null, isCoverUploadName(file.originalname))
}

const coverUpload = multer({
  storage: multer.diskStorage({ destination: tmpdir() }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: coverFileFilter,
})

function cleanupUploadedFiles(paths: string[]) {
  for (const uploadedPath of paths) {
    try {
      unlinkSync(uploadedPath)
    } catch {
      // ignore temp cleanup errors
    }
  }
}

function getFirstUploadedFile(files: unknown): Express.Multer.File | undefined {
  if (!files || Array.isArray(files)) return undefined
  const groups = files as Record<string, Express.Multer.File[] | undefined>
  return groups.book?.[0] ?? groups.epub?.[0]
}

function parseUploadLastModified(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const numeric = Number(value)
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function normalizeUploadedName(name: string): string {
  const looksMojibake = /Ã|Â|áº|á»|Ä|Æ|Ð|ð/.test(name)
  if (!looksMojibake) return name

  const repaired = Buffer.from(name, 'latin1').toString('utf8')
  return repaired.includes('\uFFFD') ? name : repaired
}

function parsePage(value: unknown): number {
  const page = parseInt(String(value ?? '1'), 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

function parseLimit(value: unknown): number {
  const limit = parseInt(String(value ?? '48'), 10)
  if (!Number.isFinite(limit) || limit < 1) return 48
  return Math.min(limit, 100)
}

function readQueryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function findLocalLibraryDocument(source: 'hako' | 'epub' | 'pdf', objectId: import('mongodb').ObjectId) {
  switch (source) {
    case 'hako':
      return getLocalLibraryHakoCollection().findOne({ _id: objectId })
    case 'epub':
      return getLocalLibraryEpubCollection().findOne({ _id: objectId })
    case 'pdf':
      return getLocalLibraryPdfCollection().findOne({ _id: objectId })
  }
}

export function createLocalLibraryRouter(imgDir = LOCAL_LIBRARY_CONFIG.imgDir) {
  const router = Router()

  router.get('/cold-storage/status', async (req, res) => {
    try {
      const refresh = readQueryString(req.query.refresh) === '1'
      const status = refresh ? await refreshStorageMounts() : getColdStorageStatus()
      res.json(status)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read cold storage status' })
    }
  })

  router.get('/', async (req, res) => {
    try {
      const result = await listLocalLibrary({
        q: readQueryString(req.query.q),
        source: readQueryString(req.query.source),
        sort: readQueryString(req.query.sort),
        page: parsePage(req.query.page),
        limit: parseLimit(req.query.limit),
      })
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list local library' })
    }
  })

  router.post('/import', (req, res, next) => {
    bookUpload.fields([
      { name: 'book', maxCount: 1 },
      { name: 'epub', maxCount: 1 },
    ])(req, res, err => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid upload' })
        return
      }
      next()
    })
  }, async (req, res) => {
    const uploadedFile = getFirstUploadedFile(req.files)
    const uploadedPath = uploadedFile?.path
    if (!uploadedPath) {
      res.status(400).json({ error: 'Book file is required' })
      return
    }

    try {
      const source = {
        originalName: normalizeUploadedName(uploadedFile.originalname),
        sizeBytes: uploadedFile.size,
        lastModifiedAt: parseUploadLastModified(req.body?.lastModified),
      }
      const book = isPdfUploadName(uploadedFile.originalname)
        ? await importLocalLibraryFromPdf(uploadedPath, imgDir, source)
        : await importLocalLibraryFromEpub(uploadedPath, imgDir, source)
      res.status(201).json(book)
    } catch (err) {
      if (err instanceof LocalLibraryImportError) {
        res.status(err.status).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Failed to import book' })
    } finally {
      cleanupUploadedFiles([uploadedPath])
    }
  })

  router.post('/open-folder', async (req, res) => {
    try {
      const folderPath = typeof req.body?.folderPath === 'string' ? req.body.folderPath : undefined
      await openLocalLibraryFolder(folderPath)
      res.json({ ok: true })
    } catch (err) {
      const status = err instanceof LocalLibraryFileError ? err.status : 500
      res.status(status).json({ error: err instanceof Error ? err.message : 'Failed to open folder' })
    }
  })

  router.get('/cover/:id', async (req, res) => {
    try {
      const parsed = parseLocalLibraryItemId(req.params.id)
      if (!parsed) {
        res.status(400).json({ error: 'Invalid book id' })
        return
      }

      const doc = await findLocalLibraryDocument(parsed.source, parsed.objectId)
      if (!doc?.cover) {
        res.status(404).json({ error: 'No cover art' })
        return
      }

      const filePath = join(imgDir, doc.cover)
      if (!existsSync(filePath)) {
        res.status(404).json({ error: 'Cover file not found' })
        return
      }

      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'max-age=86400',
      })
      res.sendFile(filePath, err => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: 'Cover file not found' })
        }
      })
    } catch (_err) {
      res.status(500).json({ error: 'Failed to load cover' })
    }
  })

  router.patch('/:id/progress', async (req, res) => {
    try {
      const book = await updateLocalLibraryReadingProgress(req.params.id, {
        locationKey: typeof req.body?.locationKey === 'string' ? req.body.locationKey : undefined,
        spineIndex: typeof req.body?.spineIndex === 'number' ? req.body.spineIndex : undefined,
        chapterPath: typeof req.body?.chapterPath === 'string' ? req.body.chapterPath : undefined,
        scrollPercent: typeof req.body?.scrollPercent === 'number' ? req.body.scrollPercent : undefined,
        scrollTop: typeof req.body?.scrollTop === 'number' ? req.body.scrollTop : undefined,
      })
      res.json(book)
    } catch (err) {
      if (err instanceof LocalLibraryUpdateError) {
        res.status(err.status).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Failed to update reading progress' })
    }
  })

  router.patch('/:id/last-read', async (req, res) => {
    try {
      const book = await updateLocalLibraryLastRead(
        req.params.id,
        typeof req.body?.locationKey === 'string' ? req.body.locationKey : undefined,
      )
      res.json(book)
    } catch (err) {
      if (err instanceof LocalLibraryUpdateError) {
        res.status(err.status).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Failed to update last read time' })
    }
  })

  router.patch('/:id', (req, res, next) => {
    coverUpload.single('cover')(req, res, err => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid cover upload' })
        return
      }
      next()
    })
  }, async (req, res) => {
    const uploadedCoverPath = req.file?.path
    try {
      const book = await updateLocalLibraryBook(req.params.id, imgDir, {
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        coverPath: uploadedCoverPath,
      })
      res.json(book)
    } catch (err) {
      if (err instanceof LocalLibraryImportError) {
        res.status(err.status).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Failed to update book' })
    } finally {
      if (uploadedCoverPath) cleanupUploadedFiles([uploadedCoverPath])
    }
  })

  router.delete('/:id', async (req, res) => {
    try {
      await deleteLocalLibraryBook(req.params.id, imgDir)
      res.json({ ok: true })
    } catch (err) {
      if (err instanceof LocalLibraryImportError) {
        res.status(err.status).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Failed to delete book' })
    }
  })

  router.delete('/:id/last-read', async (req, res) => {
    try {
      const book = await clearLocalLibraryLastRead(req.params.id)
      res.json(book)
    } catch (err) {
      if (err instanceof LocalLibraryUpdateError) {
        res.status(err.status).json({ error: err.message })
        return
      }
      res.status(500).json({ error: 'Failed to clear last read' })
    }
  })

  router.get('/:id/file', async (req, res) => {
    try {
      const parsed = parseLocalLibraryItemId(req.params.id)
      if (!parsed) {
        res.status(400).json({ error: 'Invalid book id' })
        return
      }

      const doc = await findLocalLibraryDocument(parsed.source, parsed.objectId)
      if (!doc) {
        res.status(404).json({ error: 'Book not found' })
        return
      }

      if (doc.drive?.trim() && !resolveColdStorageMount(doc.drive)) {
        await refreshStorageMounts()
      }

      const variantRaw = readQueryString(req.query.variant)?.toLowerCase()
      const variant = variantRaw === 'lite' ? 'lite' : 'full'
      const asDownload = (() => {
        const raw = readQueryString(req.query.download)?.toLowerCase()
        return raw === '1' || raw === 'true' || raw === 'yes'
      })()
      const file = openLocalLibraryFile(parsed.source, doc, variant)
      const contentType = file.fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'application/epub+zip'
      const disposition = asDownload ? 'attachment' : 'inline'
      const safeFileName = file.fileName.replace(/[\r\n"]/g, '_')

      res.set({
        'Content-Type': contentType,
        'Content-Length': String(file.size),
        'Content-Disposition': `${disposition}; filename="${safeFileName}"`,
        'Cache-Control': 'private, max-age=3600',
        'X-EPUB-Variant': variant,
      })
      file.stream.pipe(res)
    } catch (err) {
      const status = err instanceof LocalLibraryFileError ? err.status : 500
      res.status(status).json({ error: err instanceof Error ? err.message : 'Failed to open book file' })
    }
  })

  router.get('/:id/toc', async (req, res) => {
    try {
      const toc = await getLocalLibraryBookToc(req.params.id)
      res.json(toc)
    } catch (err) {
      if (err instanceof LocalLibraryTocError) {
        res.status(err.status).json({ error: err.message, errorCode: err.code })
        return
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch book table of contents' })
    }
  })

  router.get('/:id', async (req, res) => {
    try {
      const parsed = parseLocalLibraryItemId(req.params.id)
      if (!parsed) {
        res.status(400).json({ error: 'Invalid book id' })
        return
      }

      const doc = await findLocalLibraryDocument(parsed.source, parsed.objectId)
      if (!doc) {
        res.status(404).json({ error: 'Book not found' })
        return
      }

      res.json(toLocalLibraryDetailDTO(
        normalizeLocalLibraryDocument(parsed.source, doc),
        doc,
      ))
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to fetch book' })
    }
  })

  return router
}
