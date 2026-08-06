import { execFile } from 'child_process'
import { randomBytes } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'fs'
import { tmpdir } from 'os'
import { basename, extname, join } from 'path'
import { promisify } from 'util'
import JSZip from 'jszip'
import { ObjectId } from 'mongodb'
import sharp from 'sharp'
import { LOCAL_LIBRARY_CONFIG } from '../config/local-library.js'
import {
  getLocalLibraryEpubCollection,
  getLocalLibraryPdfCollection,
  parseLocalLibraryItemId,
  toLocalLibraryItemId,
  type LocalLibraryImportDocument,
  type LocalLibrarySource,
} from '../models/local-library.model.js'
import type { LocalLibraryDetailDTO } from '../types.js'
import {
  normalizeLocalLibraryDocument,
  resolveLocalLibraryFilePath,
  toLocalLibraryDetailDTO,
} from './book-read-service.js'

const execFileAsync = promisify(execFile)
const CHARS_PER_WORD = Number.parseFloat(process.env.MIGRATE_CHARS_PER_WORD ?? '3.6')
const DEFAULT_CHARS_PER_PAGE = 1800
const IMPORT_KEY_FILE = /^I?(\d+)\.(?:epub|pdf)$/i

// ── Public types / errors ───────────────────────────────────────────────────

export interface LocalLibraryImportSourceMeta {
  originalName: string
  sizeBytes: number
  lastModifiedAt?: Date | string
}

export class LocalLibraryImportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'LocalLibraryImportError'
  }
}

export interface LocalLibraryBookUpdateInput {
  title?: string
  /** Absolute path to an uploaded cover image (jpeg/png/webp). */
  coverPath?: string
}

export class EpubMetaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EpubMetaError'
  }
}

export interface EpubMetadata {
  title: string
  author?: string
  description?: string
}

interface EpubTextStats {
  charCountSections: number
  charCountNoSpace: number
  charCountEstPages: number
}

interface EpubCover {
  status: 'ok' | 'missing' | 'failed'
  data?: Buffer
  extension: '.jpg' | '.png' | '.webp'
}

interface PdfMetadata {
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string
  producer?: string
  creationDate?: string
  modDate?: string
  encrypted?: boolean
  pageCount?: number
  pageSize?: string
  pdfVersion?: string
}

interface PdfCoverResult {
  status: 'ok' | 'missing' | 'failed'
  coverFile?: string
  coverPath?: string
  coverUrl?: string
}

// ── Shared helpers ──────────────────────────────────────────────────────────

export function normalizeImportSourceName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return basename(trimmed.replace(/\//g, '\\'))
}

function logLocalImport(message: string, details?: Record<string, unknown>): void {
  const suffix = details ? ` ${JSON.stringify(details)}` : ''
  console.log(`[book-import] ${message}${suffix}`)
}

function randomCoverFileName(): string {
  return `${randomBytes(8).toString('hex')}.jpg`
}

function importKey(id: number, ext: 'epub' | 'pdf'): string {
  return `I${id}.${ext}`
}

function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function epubCharCountFromStats(charCountNoSpace: number): number {
  return Math.max(1, Math.round(charCountNoSpace / CHARS_PER_WORD))
}

function titleFromPdfFileName(fileName: string): string {
  return basename(fileName, extname(fileName)).trim() || fileName
}

async function writeCoverJpeg(coverData: Buffer, imgDir: string, coverFile: string): Promise<void> {
  await sharp(coverData)
    .rotate()
    .resize({ width: 480, height: 720, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(join(imgDir, coverFile))
}

function copyOrReuseFile(sourcePath: string, destPath: string, buffer: Buffer): 'copied' | 'reused' {
  if (existsSync(destPath)) {
    const existing = readFileSync(destPath)
    if (existing.equals(buffer)) return 'reused'
    throw new LocalLibraryImportError(`File already exists: ${destPath}`, 409)
  }

  copyFileSync(sourcePath, destPath)
  return 'copied'
}

// ── Import ID allocation ────────────────────────────────────────────────────

function collectNumericIdsFromDir(root: string, maxDepth = 6): number[] {
  const ids: number[] = []

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    for (const name of entries) {
      const fullPath = join(dir, name)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isFile()) {
        const match = name.match(IMPORT_KEY_FILE)
        if (match) ids.push(Number.parseInt(match[1], 10))
        continue
      }

      if (stat.isDirectory()) walk(fullPath, depth + 1)
    }
  }

  walk(root, 0)
  return ids
}

function numericIdFromKey(key: string): number | null {
  const match = key.match(IMPORT_KEY_FILE)
  if (!match) return null
  const id = Number.parseInt(match[1], 10)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

async function collectNumericIdsFromCollections(): Promise<number[]> {
  const [epubDocs, pdfDocs] = await Promise.all([
    getLocalLibraryEpubCollection().find({}, { projection: { key: 1 } }).toArray(),
    getLocalLibraryPdfCollection().find({}, { projection: { key: 1 } }).toArray(),
  ])

  const ids: number[] = []
  for (const doc of [...epubDocs, ...pdfDocs]) {
    const id = numericIdFromKey(doc.key)
    if (id) ids.push(id)
  }
  return ids
}

async function allocateNextLocalImportId(): Promise<number> {
  const [dbIds, fsIds] = await Promise.all([
    collectNumericIdsFromCollections(),
    Promise.resolve(collectNumericIdsFromDir(LOCAL_LIBRARY_CONFIG.importDir)),
  ])
  return Math.max(0, ...dbIds, ...fsIds) + 1
}

async function assertNotDuplicateLocalImport(source: LocalLibraryImportSourceMeta): Promise<void> {
  const importSourceName = normalizeImportSourceName(source.originalName)
  const filter = {
    importSourceName,
    importSourceSizeBytes: source.sizeBytes,
  }

  const [epubDup, pdfDup] = await Promise.all([
    getLocalLibraryEpubCollection().findOne(filter, { projection: { title: 1 } }),
    getLocalLibraryPdfCollection().findOne(filter, { projection: { title: 1 } }),
  ])

  const duplicate = epubDup ?? pdfDup
  if (!duplicate) return

  throw new LocalLibraryImportError(
    `Already imported: ${importSourceName} (${source.sizeBytes} bytes) → ${duplicate.title}`,
    409,
  )
}

// ── EPUB metadata / cover ───────────────────────────────────────────────────

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim()
}

function readTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!match?.[1]) return undefined
  const value = decodeXmlEntities(match[1])
  return value || undefined
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
}

function countNoSpace(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length
}

function attrsFromTag(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
    attrs.set(match[1], match[2])
  }
  return attrs
}

function resolvePath(baseDir: string, relative: string): string {
  const parts = baseDir.split('/').filter(Boolean)
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/')
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path) ?? zip.file(path.replace(/^\//, ''))
  if (!file) return null
  return file.async('string')
}

async function readZipBuffer(zip: JSZip, path: string): Promise<Buffer | null> {
  const file = zip.file(path) ?? zip.file(path.replace(/^\//, ''))
  if (!file) return null
  return Buffer.from(await file.async('arraybuffer'))
}

function findOpfPath(containerXml: string): string | null {
  const match = containerXml.match(/full-path="([^"]+)"/i)
  return match?.[1] ?? null
}

function parseSpineContentPaths(opfXml: string, opfPath: string): string[] {
  const manifest = new Map<string, { href: string; mediaType: string }>()
  for (const match of opfXml.matchAll(/<item\b[^>]*>/gi)) {
    const attrs = attrsFromTag(match[0])
    const id = attrs.get('id')
    const href = attrs.get('href')
    const mediaType = attrs.get('media-type') ?? ''
    if (id && href) manifest.set(id, { href, mediaType })
  }

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const paths: string[] = []
  for (const match of opfXml.matchAll(/<itemref\b[^>]*>/gi)) {
    const attrs = attrsFromTag(match[0])
    const idref = attrs.get('idref')
    const item = idref ? manifest.get(idref) : null
    if (!item) continue
    if (!/x?html|xml|text/i.test(item.mediaType) && !/\.(xhtml|html?|xml)$/i.test(item.href)) {
      continue
    }
    paths.push(resolvePath(opfDir, item.href))
  }

  if (paths.length) return paths

  return [...manifest.values()]
    .filter(item =>
      /x?html|xml|text/i.test(item.mediaType) || /\.(xhtml|html?|xml)$/i.test(item.href),
    )
    .map(item => resolvePath(opfDir, item.href))
}

function findCoverHref(opfXml: string, manifestById: Map<string, string>): string | null {
  const metaMatch = opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i)
    ?? opfXml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["']/i)
  if (metaMatch?.[1] && manifestById.has(metaMatch[1])) {
    return manifestById.get(metaMatch[1]) ?? null
  }

  for (const [id, href] of manifestById) {
    if (id.toLowerCase().includes('cover') && /\.(jpe?g|png|webp)$/i.test(href)) {
      return href
    }
  }

  for (const href of manifestById.values()) {
    if (/cover/i.test(href) && /\.(jpe?g|png|webp)$/i.test(href)) {
      return href
    }
  }

  for (const href of manifestById.values()) {
    if (/\.(jpe?g|png|webp)$/i.test(href)) {
      return href
    }
  }

  return null
}

function coverExtension(href: string, mediaType?: string): '.jpg' | '.png' | '.webp' {
  const lower = (mediaType ?? href).toLowerCase()
  if (lower.includes('png') || href.toLowerCase().endsWith('.png')) return '.png'
  if (lower.includes('webp') || href.toLowerCase().endsWith('.webp')) return '.webp'
  return '.jpg'
}

export async function parseEpubMetadata(buffer: Buffer): Promise<EpubMetadata> {
  const zip = await JSZip.loadAsync(buffer)
  const containerXml = await readZipText(zip, 'META-INF/container.xml')
  if (!containerXml) {
    throw new EpubMetaError('Invalid EPUB: missing container.xml')
  }

  const opfPath = findOpfPath(containerXml)
  if (!opfPath) {
    throw new EpubMetaError('Invalid EPUB: missing OPF path')
  }

  const opfXml = await readZipText(zip, opfPath)
  if (!opfXml) {
    throw new EpubMetaError('Invalid EPUB: missing OPF file')
  }

  const title = readTag(opfXml, 'dc:title') ?? readTag(opfXml, 'title')
  if (!title) {
    throw new EpubMetaError('EPUB has no title metadata')
  }

  return {
    title,
    author: readTag(opfXml, 'dc:creator') ?? readTag(opfXml, 'creator'),
    description: readTag(opfXml, 'dc:description') ?? readTag(opfXml, 'description'),
  }
}

async function calculateEpubTextStats(buffer: Buffer): Promise<EpubTextStats> {
  const zip = await JSZip.loadAsync(buffer)
  const containerXml = await readZipText(zip, 'META-INF/container.xml')
  if (!containerXml) {
    throw new EpubMetaError('Invalid EPUB: missing container.xml')
  }

  const opfPath = findOpfPath(containerXml)
  if (!opfPath) {
    throw new EpubMetaError('Invalid EPUB: missing OPF path')
  }

  const opfXml = await readZipText(zip, opfPath)
  if (!opfXml) {
    throw new EpubMetaError('Invalid EPUB: missing OPF file')
  }

  const contentPaths = parseSpineContentPaths(opfXml, opfPath)
  let charCountNoSpace = 0
  let charCountSections = 0

  for (const contentPath of contentPaths) {
    const html = await readZipText(zip, contentPath)
    if (!html) continue

    const sectionChars = countNoSpace(htmlToText(html))
    if (sectionChars <= 0) continue
    charCountSections += 1
    charCountNoSpace += sectionChars
  }

  if (charCountNoSpace <= 0) {
    throw new EpubMetaError('EPUB has no readable text content')
  }

  const configuredCharsPerPage = Number.parseInt(process.env.EPUB_CHARS_PER_PAGE ?? '', 10)
  const charsPerPage = Number.isFinite(configuredCharsPerPage) && configuredCharsPerPage > 0
    ? configuredCharsPerPage
    : DEFAULT_CHARS_PER_PAGE

  return {
    charCountSections,
    charCountNoSpace,
    charCountEstPages: Math.max(1, Math.round(charCountNoSpace / charsPerPage)),
  }
}

async function extractEpubCover(buffer: Buffer): Promise<EpubCover> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const containerXml = await readZipText(zip, 'META-INF/container.xml')
    if (!containerXml) return { status: 'missing', extension: '.jpg' }

    const opfPath = findOpfPath(containerXml)
    if (!opfPath) return { status: 'missing', extension: '.jpg' }

    const opfXml = await readZipText(zip, opfPath)
    if (!opfXml) return { status: 'missing', extension: '.jpg' }

    const manifestById = new Map<string, string>()
    for (const match of opfXml.matchAll(/<item\b[^>]*>/gi)) {
      const tag = match[0]
      const id = tag.match(/\bid=["']([^"']+)["']/i)?.[1]
      const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1]
      if (id && href) manifestById.set(id, href)
    }

    const coverHref = findCoverHref(opfXml, manifestById)
    if (!coverHref) return { status: 'missing', extension: '.jpg' }

    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
    const coverPath = resolvePath(opfDir, coverHref)
    const data = await readZipBuffer(zip, coverPath)
    if (!data?.length) return { status: 'missing', extension: '.jpg' }

    return {
      status: 'ok',
      data,
      extension: coverExtension(coverHref),
    }
  } catch {
    return { status: 'failed', extension: '.jpg' }
  }
}

// ── PDF metadata / cover ────────────────────────────────────────────────────

function cleanInfoValue(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'yes') return true
  if (normalized === 'no') return false
  return undefined
}

function parsePdfInfo(output: string): PdfMetadata {
  const values = new Map<string, string>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/)
    if (match) values.set(match[1].trim(), match[2].trim())
  }

  const pages = Number.parseInt(values.get('Pages') ?? '', 10)

  return {
    title: cleanInfoValue(values.get('Title') ?? ''),
    author: cleanInfoValue(values.get('Author') ?? ''),
    subject: cleanInfoValue(values.get('Subject') ?? ''),
    keywords: cleanInfoValue(values.get('Keywords') ?? ''),
    creator: cleanInfoValue(values.get('Creator') ?? ''),
    producer: cleanInfoValue(values.get('Producer') ?? ''),
    creationDate: cleanInfoValue(values.get('CreationDate') ?? ''),
    modDate: cleanInfoValue(values.get('ModDate') ?? ''),
    encrypted: parseBoolean(values.get('Encrypted') ?? ''),
    pageCount: Number.isFinite(pages) && pages > 0 ? pages : undefined,
    pageSize: cleanInfoValue(values.get('Page size') ?? ''),
    pdfVersion: cleanInfoValue(values.get('PDF version') ?? ''),
  }
}

function createAsciiTempPdf(sourcePath: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'book-pdf-'))
  const tempPath = join(dir, 'source.pdf')
  copyFileSync(sourcePath, tempPath)
  return { dir, path: tempPath }
}

async function parsePdfMetadata(sourcePath: string): Promise<PdfMetadata> {
  const temp = createAsciiTempPdf(sourcePath)
  try {
    const { stdout } = await execFileAsync('pdfinfo.exe', ['-enc', 'UTF-8', temp.path], { windowsHide: true })
    return parsePdfInfo(stdout)
  } finally {
    rmSync(temp.dir, { recursive: true, force: true })
  }
}

async function extractPdfFirstPageCover(
  sourcePath: string,
  coverFile: string,
  coverDir: string,
): Promise<PdfCoverResult> {
  if (!existsSync(sourcePath)) return { status: 'missing' }

  const temp = createAsciiTempPdf(sourcePath)
  try {
    const coverTempPrefix = join(temp.dir, 'cover')
    await execFileAsync(
      'pdftoppm.exe',
      ['-f', '1', '-singlefile', '-jpeg', '-r', '150', temp.path, coverTempPrefix],
      { windowsHide: true },
    )

    const renderedCover = `${coverTempPrefix}.jpg`
    if (!existsSync(renderedCover)) return { status: 'failed' }

    mkdirSync(coverDir, { recursive: true })
    await sharp(renderedCover)
      .resize({
        width: 480,
        height: 720,
        fit: 'contain',
        background: '#f5f7fb',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toFile(join(coverDir, coverFile))

    return {
      status: 'ok',
      coverFile,
      coverPath: `data/covers/${coverFile}`,
      coverUrl: `/covers/${coverFile}`,
    }
  } catch {
    return { status: 'failed' }
  } finally {
    rmSync(temp.dir, { recursive: true, force: true })
  }
}

// ── Import entry points ─────────────────────────────────────────────────────

export async function importLocalLibraryFromEpub(
  sourcePath: string,
  imgDir: string,
  source: LocalLibraryImportSourceMeta,
): Promise<LocalLibraryDetailDTO> {
  if (!existsSync(sourcePath)) {
    throw new LocalLibraryImportError('Uploaded EPUB file not found', 400)
  }

  logLocalImport('epub import start', { sourcePath, originalName: source.originalName })
  await assertNotDuplicateLocalImport(source)

  const buffer = readFileSync(sourcePath)
  let metadata
  try {
    metadata = await parseEpubMetadata(buffer)
  } catch (err) {
    if (err instanceof EpubMetaError) {
      throw new LocalLibraryImportError(err.message, 400)
    }
    throw err
  }

  const title = metadata.title.trim()
  const importId = await allocateNextLocalImportId()
  const key = importKey(importId, 'epub')
  const destPath = join(LOCAL_LIBRARY_CONFIG.importDir, key)

  const existing = await getLocalLibraryEpubCollection().findOne({ key })
  if (existing) {
    throw new LocalLibraryImportError(`Book key already exists: ${key}`, 409)
  }

  mkdirSync(LOCAL_LIBRARY_CONFIG.importDir, { recursive: true })
  copyOrReuseFile(sourcePath, destPath, buffer)

  const { size } = statSync(destPath)
  const sizeKb = Math.round((size / 1024) * 10) / 10
  const textStats = await calculateEpubTextStats(buffer)
  const charCount = epubCharCountFromStats(textStats.charCountNoSpace)

  const docId = new ObjectId()
  const cover = await extractEpubCover(buffer)
  let coverFile: string | null = null
  if (cover.status === 'ok' && cover.data) {
    coverFile = randomCoverFileName()
    try {
      await writeCoverJpeg(cover.data, imgDir, coverFile)
    } catch {
      coverFile = null
    }
  }

  const importSourceName = normalizeImportSourceName(source.originalName)
  const doc = {
    _id: docId,
    key,
    title,
    cover: coverFile,
    lastUpdate: toDate(source.lastModifiedAt) ?? new Date(),
    sizeKb,
    charCount,
    importSourceName,
    importSourceSizeBytes: source.sizeBytes,
  }

  await getLocalLibraryEpubCollection().insertOne(doc)
  logLocalImport('epub import ok', { id: toLocalLibraryItemId('epub', docId), key })

  return toLocalLibraryDetailDTO(
    normalizeLocalLibraryDocument('epub', doc),
    doc,
  )
}

export async function importLocalLibraryFromPdf(
  sourcePath: string,
  imgDir: string,
  source: LocalLibraryImportSourceMeta,
): Promise<LocalLibraryDetailDTO> {
  if (!existsSync(sourcePath)) {
    throw new LocalLibraryImportError('Uploaded PDF file not found', 400)
  }

  await assertNotDuplicateLocalImport(source)

  let metadata
  try {
    metadata = await parsePdfMetadata(sourcePath)
  } catch {
    throw new LocalLibraryImportError('Failed to read PDF metadata', 400)
  }

  const title = metadata.title?.trim() || titleFromPdfFileName(source.originalName)
  const importId = await allocateNextLocalImportId()
  const key = importKey(importId, 'pdf')
  const destPath = join(LOCAL_LIBRARY_CONFIG.importDir, key)

  const existing = await getLocalLibraryPdfCollection().findOne({ key })
  if (existing) {
    throw new LocalLibraryImportError(`Book key already exists: ${key}`, 409)
  }

  mkdirSync(LOCAL_LIBRARY_CONFIG.importDir, { recursive: true })
  if (existsSync(destPath)) {
    throw new LocalLibraryImportError(`PDF file already exists: ${key}`, 409)
  }
  copyFileSync(sourcePath, destPath)

  const { size } = statSync(destPath)
  const sizeKb = Math.round((size / 1024) * 10) / 10

  const docId = new ObjectId()
  const coverFile = randomCoverFileName()
  let cover: string | null = null
  try {
    const extracted = await extractPdfFirstPageCover(destPath, coverFile, imgDir)
    if (extracted.status === 'ok') cover = coverFile
  } catch {
    cover = null
  }

  const importSourceName = normalizeImportSourceName(source.originalName)
  const doc = {
    _id: docId,
    key,
    title,
    cover,
    lastUpdate: toDate(source.lastModifiedAt) ?? new Date(),
    sizeKb,
    pageCount: metadata.pageCount,
    pdfVersion: metadata.pdfVersion,
    importSourceName,
    importSourceSizeBytes: source.sizeBytes,
  }

  await getLocalLibraryPdfCollection().insertOne(doc)

  return toLocalLibraryDetailDTO(
    normalizeLocalLibraryDocument('pdf', doc),
    doc,
  )
}

// ── Manual import metadata update ───────────────────────────────────────────

function collectionForImportSource(source: Exclude<LocalLibrarySource, 'hako'>) {
  return source === 'epub'
    ? getLocalLibraryEpubCollection()
    : getLocalLibraryPdfCollection()
}

function removeCoverFile(imgDir: string, coverFile: string | null | undefined): void {
  if (!coverFile) return
  const filePath = join(imgDir, coverFile)
  if (!existsSync(filePath)) return
  try {
    unlinkSync(filePath)
  } catch {
    // ignore stale cover cleanup errors
  }
}

async function writeUploadedCover(
  coverPath: string,
  imgDir: string,
): Promise<string> {
  if (!existsSync(coverPath)) {
    throw new LocalLibraryImportError('Uploaded cover file not found', 400)
  }

  mkdirSync(imgDir, { recursive: true })
  const coverFile = randomCoverFileName()
  try {
    await writeCoverJpeg(readFileSync(coverPath), imgDir, coverFile)
  } catch {
    throw new LocalLibraryImportError('Failed to process cover image', 400)
  }
  return coverFile
}

/**
 * Update title and/or cover for a manually imported book (epub/pdf).
 * Hako books are read-only.
 */
export async function updateLocalLibraryBook(
  id: string,
  imgDir: string,
  input: LocalLibraryBookUpdateInput,
): Promise<LocalLibraryDetailDTO> {
  const parsed = parseLocalLibraryItemId(id)
  if (!parsed) {
    throw new LocalLibraryImportError('Invalid book id', 400)
  }

  if (parsed.source === 'hako') {
    throw new LocalLibraryImportError('Cannot edit Hako books', 403)
  }

  const title = typeof input.title === 'string' ? input.title.trim() : undefined
  const hasTitle = title !== undefined
  const hasCover = Boolean(input.coverPath)

  if (!hasTitle && !hasCover) {
    throw new LocalLibraryImportError('Title or cover is required', 400)
  }

  if (hasTitle && !title) {
    throw new LocalLibraryImportError('Title cannot be empty', 400)
  }

  const collection = collectionForImportSource(parsed.source)
  const existing = await collection.findOne({ _id: parsed.objectId })
  if (!existing) {
    throw new LocalLibraryImportError('Book not found', 404)
  }

  const $set: Partial<LocalLibraryImportDocument> & { lastUpdate: Date } = {
    lastUpdate: new Date(),
  }

  if (hasTitle && title) {
    $set.title = title
  }

  let previousCover: string | null | undefined
  if (hasCover && input.coverPath) {
    previousCover = existing.cover
    $set.cover = await writeUploadedCover(input.coverPath, imgDir)
  }

  const result = await collection.findOneAndUpdate(
    { _id: parsed.objectId },
    { $set },
    { returnDocument: 'after' },
  )

  if (!result) {
    if ($set.cover && $set.cover !== previousCover) {
      removeCoverFile(imgDir, $set.cover)
    }
    throw new LocalLibraryImportError('Book not found', 404)
  }

  if (hasCover && previousCover && previousCover !== result.cover) {
    removeCoverFile(imgDir, previousCover)
  }

  logLocalImport('book update ok', {
    id: toLocalLibraryItemId(parsed.source, parsed.objectId),
    title: hasTitle,
    cover: hasCover,
  })

  return toLocalLibraryDetailDTO(
    normalizeLocalLibraryDocument(parsed.source, result),
    result,
  )
}

/**
 * Delete a manually imported book (epub/pdf): DB row, cover image, and file on disk.
 * Hako books cannot be deleted.
 */
export async function deleteLocalLibraryBook(
  id: string,
  imgDir: string,
): Promise<void> {
  const parsed = parseLocalLibraryItemId(id)
  if (!parsed) {
    throw new LocalLibraryImportError('Invalid book id', 400)
  }

  if (parsed.source === 'hako') {
    throw new LocalLibraryImportError('Cannot delete Hako books', 403)
  }

  const collection = collectionForImportSource(parsed.source)
  const existing = await collection.findOne({ _id: parsed.objectId })
  if (!existing) {
    throw new LocalLibraryImportError('Book not found', 404)
  }

  const bookFilePath = resolveLocalLibraryFilePath(parsed.source, existing)

  const deleted = await collection.deleteOne({ _id: parsed.objectId })
  if (deleted.deletedCount !== 1) {
    throw new LocalLibraryImportError('Book not found', 404)
  }

  removeCoverFile(imgDir, existing.cover)

  if (bookFilePath && existsSync(bookFilePath)) {
    try {
      unlinkSync(bookFilePath)
    } catch (err) {
      logLocalImport('book file delete failed', {
        id: toLocalLibraryItemId(parsed.source, parsed.objectId),
        bookFilePath,
        error: err instanceof Error ? err.message : String(err),
      })
      throw new LocalLibraryImportError(
        'Đã xóa dữ liệu sách nhưng không xóa được file trên ổ đĩa',
        500,
      )
    }
  }

  logLocalImport('book delete ok', {
    id: toLocalLibraryItemId(parsed.source, parsed.objectId),
    key: existing.key,
    removedFile: Boolean(bookFilePath),
  })
}
