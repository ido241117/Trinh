import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import type { Document } from 'mongodb'
import JSZip from 'jszip'
import {
  listAllowedLibraryRoots,
  LOCAL_LIBRARY_CONFIG,
  resolveHakoBookDir,
  resolveImportDir,
} from '../config/local-library.js'
import { getLocalLibraryDb } from '../db.js'
import {
  getLocalLibraryEpubCollection,
  getLocalLibraryHakoCollection,
  getLocalLibraryPdfCollection,
  parseLocalLibraryItemId,
  toLocalLibraryItemId,
  type LocalLibraryHakoDocument,
  type LocalLibraryImportDocument,
  type LocalLibraryReadingProgressDocument,
  type LocalLibrarySource,
} from '../models/local-library.model.js'
import type {
  BookReadingProgressDTO,
  LocalLibraryDetailDTO,
  LocalLibraryListItemDTO,
  LocalLibraryListResponse,
} from '../types.js'

// ── File access ─────────────────────────────────────────────────

export class LocalLibraryFileError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'LocalLibraryFileError'
  }
}

function normalizeWindowsPath(value?: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return path.win32.normalize(trimmed.replace(/\//g, '\\'))
}

function isPathUnderRoot(filePath: string, rootDir: string): boolean {
  const normalizedRoot = path.win32.normalize(rootDir)
  const normalizedFile = path.win32.normalize(filePath)
  const relative = path.win32.relative(normalizedRoot, normalizedFile)
  return relative === '' || (!relative.startsWith('..') && !path.win32.isAbsolute(relative))
}

function assertReadableFile(filePath: string, rootDir: string, expectedExt: '.epub' | '.pdf') {
  const normalizedPath = normalizeWindowsPath(filePath)
  if (!normalizedPath) {
    throw new LocalLibraryFileError('File path is required', 400)
  }

  if (!/^[A-Za-z]:\\/.test(normalizedPath)) {
    throw new LocalLibraryFileError('File path must be an absolute Windows path', 400)
  }

  if (!isPathUnderRoot(normalizedPath, rootDir)) {
    throw new LocalLibraryFileError('File path is outside the configured offline library root', 403)
  }

  if (path.win32.extname(normalizedPath).toLowerCase() !== expectedExt) {
    throw new LocalLibraryFileError(`Only ${expectedExt} files can be read`, 400)
  }

  if (!existsSync(normalizedPath)) {
    throw new LocalLibraryFileError(`File not found: ${normalizedPath}`, 404)
  }

  const stat = statSync(normalizedPath)
  if (!stat.isFile()) {
    throw new LocalLibraryFileError(`Path is not a file: ${normalizedPath}`, 400)
  }

  return {
    filePath: normalizedPath,
    fileName: path.win32.basename(normalizedPath),
    size: stat.size,
    stream: createReadStream(normalizedPath),
  }
}

function legacyImportBasename(key: string): string | null {
  const match = key.match(/^I(\d+)\.(epub|pdf)$/i)
  if (!match) return null
  return `${match[1]}.${match[2].toLowerCase()}`
}

function findImportFileByBasename(rootDir: string, basename: string): string | null {
  const direct = path.win32.join(rootDir, basename)
  if (existsSync(direct) && statSync(direct).isFile()) return direct

  const stack = [rootDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    if (!dir) continue

    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = path.win32.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase() === basename.toLowerCase()) {
        return fullPath
      }
    }
  }

  return null
}

export function resolveLocalLibraryFilePath(
  source: LocalLibrarySource,
  doc: LocalLibraryHakoDocument | LocalLibraryImportDocument,
): string | null {
  if (source === 'hako') {
    const hakoDoc = doc as LocalLibraryHakoDocument
    return path.win32.join(resolveHakoBookDir(), hakoDoc.hakoId)
  }

  const importDoc = doc as LocalLibraryImportDocument
  const importRoot = resolveImportDir()
  const direct = path.win32.join(importRoot, importDoc.key)
  if (existsSync(direct) && statSync(direct).isFile()) return direct

  const legacyName = legacyImportBasename(importDoc.key)
  if (legacyName) {
    return findImportFileByBasename(importRoot, legacyName)
  }

  return findImportFileByBasename(importRoot, path.win32.basename(importDoc.key))
}

/**
 * Text-only EPUB under OFFLINE_EPUB_NOPICTURE_DIR (same basename as hako Book/).
 * Import books are not mirrored — returns null.
 */
export function resolveLocalLibraryLiteFilePath(
  source: LocalLibrarySource,
  doc: LocalLibraryHakoDocument | LocalLibraryImportDocument,
): string | null {
  const nopictureDir = LOCAL_LIBRARY_CONFIG.hakoBookNopictureDir
  if (!nopictureDir || source !== 'hako') return null

  const hakoDoc = doc as LocalLibraryHakoDocument
  const litePath = path.win32.join(nopictureDir, hakoDoc.hakoId)
  if (!existsSync(litePath)) return null

  try {
    if (!statSync(litePath).isFile()) return null
  } catch {
    return null
  }

  return litePath
}

export function resolveLocalLibraryFileRoot(source: LocalLibrarySource): string {
  return source === 'hako' ? resolveHakoBookDir() : resolveImportDir()
}

export type LocalLibraryFileVariant = 'full' | 'lite'

export function openLocalLibraryFile(
  source: LocalLibrarySource,
  doc: LocalLibraryHakoDocument | LocalLibraryImportDocument,
  variant: LocalLibraryFileVariant = 'full',
) {
  if (variant === 'lite') {
    const litePath = resolveLocalLibraryLiteFilePath(source, doc)
    if (!litePath) {
      throw new LocalLibraryFileError('Lite EPUB not available', 404)
    }
    return assertReadableFile(litePath, LOCAL_LIBRARY_CONFIG.hakoBookNopictureDir, '.epub')
  }

  const filePath = resolveLocalLibraryFilePath(source, doc)
  if (!filePath) {
    throw new LocalLibraryFileError('Book file not found on disk', 404)
  }

  const ext = path.win32.extname(filePath).toLowerCase()
  if (ext !== '.epub' && ext !== '.pdf') {
    throw new LocalLibraryFileError('Only .epub and .pdf files can be read', 400)
  }

  const rootDir = resolveLocalLibraryFileRoot(source)

  return assertReadableFile(filePath, rootDir, ext)
}

export function resolveLocalLibraryFolderPath(filePath: string): string | null {
  const normalizedPath = normalizeWindowsPath(filePath)
  if (!normalizedPath) return null
  return path.win32.dirname(normalizedPath)
}

export async function openLocalLibraryFolder(folderPath?: string): Promise<void> {
  const normalizedPath = normalizeWindowsPath(folderPath)
  if (!normalizedPath) {
    throw new LocalLibraryFileError('Folder path is required', 400)
  }

  const allowedRoots = listAllowedLibraryRoots()

  if (!allowedRoots.some(root => isPathUnderRoot(normalizedPath, root))) {
    throw new LocalLibraryFileError('Folder path is outside the configured offline library roots', 403)
  }

  if (!existsSync(normalizedPath)) {
    throw new LocalLibraryFileError(`Folder not found: ${normalizedPath}`, 404)
  }

  const stat = statSync(normalizedPath)
  if (!stat.isDirectory()) {
    throw new LocalLibraryFileError(`Path is not a directory: ${normalizedPath}`, 400)
  }

  const { spawn } = await import('child_process')
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('explorer.exe', [normalizedPath], {
      detached: true,
      stdio: 'ignore',
    })

    proc.once('spawn', () => {
      proc.unref()
      resolve()
    })

    proc.once('error', err => {
      reject(new LocalLibraryFileError(
        err instanceof Error ? err.message : 'Failed to launch Explorer',
        500,
      ))
    })
  })
}

// ── DTO / mapper ────────────────────────────────────────────────

export type LocalLibrarySourceFilter = 'all' | LocalLibrarySource

export type LocalLibrarySort =
  | ''
  | 'hako_id_asc'
  | 'hako_id_desc'
  | 'title_asc'
  | 'title_desc'
  | 'length_asc'
  | 'length_desc'
  | 'size_asc'
  | 'size_desc'
  | 'last_read_asc'
  | 'last_read_desc'
  | 'last_update_asc'
  | 'last_update_desc'

export interface NormalizedLocalLibraryRow {
  _id: { toHexString(): string }
  source: LocalLibrarySource
  libraryKey: string
  title: string
  cover?: string | null
  format: 'epub' | 'pdf'
  sizeKb?: number | null
  charCount?: number | null
  pageCount?: number | null
  numericId: number
  lengthValue?: number | null
  lastReadAt?: Date | string | null
  lastUpdate?: Date | string | null
  seriesUrl?: string | null
}

export function normalizeSourceFilter(value?: string): LocalLibrarySourceFilter {
  switch (value?.trim()) {
    case 'hako':
    case 'epub':
    case 'pdf':
      return value.trim() as LocalLibrarySource
    default:
      return 'all'
  }
}

export function normalizeLocalLibrarySort(value?: string): LocalLibrarySort {
  switch (value?.trim()) {
    case 'hako_id_asc':
    case 'hako_id_desc':
    case 'title_asc':
    case 'title_desc':
    case 'length_asc':
    case 'length_desc':
    case 'size_asc':
    case 'size_desc':
      return value.trim() as LocalLibrarySort
    case 'last_read_asc':
    case 'last_read_desc':
    case 'last_update_asc':
    case 'last_update_desc':
      return value.trim() as LocalLibrarySort
    default:
      return ''
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function importKeyVariants(id: string): string[] {
  return [`I${id}.epub`, `I${id}.pdf`, `${id}.epub`, `${id}.pdf`]
}

export function buildHakoCollectionMatch(q?: string): Record<string, unknown> {
  const trimmed = q?.trim()
  if (!trimmed) return {}

  const numericId = trimmed.match(/^(\d+)$/)?.[1]
  if (numericId) {
    return { hakoId: `${numericId}.epub` }
  }

  const pattern = escapeRegex(trimmed)
  const regex = new RegExp(pattern, 'i')
  return {
    $or: [{ hakoId: regex }, { title: regex }],
  }
}

export function buildImportCollectionMatch(q?: string): Record<string, unknown> {
  const trimmed = q?.trim()
  if (!trimmed) return {}

  const numericId = trimmed.match(/^I?(\d+)$/i)?.[1]
  if (numericId) {
    return { key: { $in: importKeyVariants(numericId) } }
  }

  const pattern = escapeRegex(trimmed)
  const regex = new RegExp(pattern, 'i')
  return {
    $or: [{ key: regex }, { title: regex }],
  }
}

export function filterForLocalLibrarySort(sort?: LocalLibrarySort): Record<string, unknown> | undefined {
  switch (sort) {
    case 'hako_id_asc':
    case 'hako_id_desc':
      return { source: 'hako', numericId: { $gt: 0 } }
    case 'length_asc':
    case 'length_desc':
      return {
        source: { $in: ['hako', 'epub'] },
        lengthValue: { $type: 'number' },
      }
    case 'size_asc':
    case 'size_desc':
      return { sizeKb: { $type: 'number' } }
    case 'last_read_asc':
    case 'last_read_desc':
      return { lastReadAt: { $nin: [null, ''] } }
    case 'last_update_asc':
    case 'last_update_desc':
      return { lastUpdate: { $nin: [null, ''] } }
    default:
      return undefined
  }
}

export function toLocalLibraryMongoSort(sort?: LocalLibrarySort): Record<string, 1 | -1> {
  switch (sort) {
    case 'hako_id_asc':
      return { numericId: 1, title: 1 }
    case 'hako_id_desc':
      return { numericId: -1, title: 1 }
    case 'title_asc':
      return { title: 1 }
    case 'title_desc':
      return { title: -1 }
    case 'length_asc':
      return { lengthValue: 1, title: 1 }
    case 'length_desc':
      return { lengthValue: -1, title: 1 }
    case 'size_asc':
      return { sizeKb: 1, title: 1 }
    case 'size_desc':
      return { sizeKb: -1, title: 1 }
    case 'last_read_asc':
      return { lastReadAt: 1, title: 1 }
    case 'last_read_desc':
      return { lastReadAt: -1, title: 1 }
    case 'last_update_asc':
      return { lastUpdate: 1, numericId: 1 }
    case 'last_update_desc':
      return { lastUpdate: -1, numericId: -1 }
    default:
      return { numericId: -1, title: 1 }
  }
}

const NUMERIC_ID_FROM_HAKO = {
  $convert: {
    input: { $arrayElemAt: [{ $split: ['$hakoId', '.'] }, 0] },
    to: 'int',
    onError: 0,
    onNull: 0,
  },
}

const NUMERIC_ID_FROM_IMPORT_KEY = {
  $let: {
    vars: {
      idPart: { $arrayElemAt: [{ $split: ['$key', '.'] }, 0] },
    },
    in: {
      $convert: {
        input: {
          $cond: [
            { $eq: [{ $substrCP: ['$$idPart', 0, 1] }, 'I'] },
            { $substrCP: ['$$idPart', 1, { $strLenCP: '$$idPart' }] },
            '$$idPart',
          ],
        },
        to: 'int',
        onError: 0,
        onNull: 0,
      },
    },
  },
}

export function buildHakoNormalizeStages(match: Record<string, unknown>): Document[] {
  const stages: Document[] = []
  if (Object.keys(match).length > 0) {
    stages.push({ $match: match })
  }

  stages.push({
    $addFields: {
      source: 'hako',
      libraryKey: '$hakoId',
      format: 'epub',
      numericId: NUMERIC_ID_FROM_HAKO,
      lengthValue: '$charCount',
      lastReadAt: '$lastReadAt',
      lastUpdate: '$lastUpdate',
    },
  })

  return stages
}

export function buildImportNormalizeStages(
  source: 'epub' | 'pdf',
  match: Record<string, unknown>,
): Document[] {
  const stages: Document[] = []
  if (Object.keys(match).length > 0) {
    stages.push({ $match: match })
  }

  stages.push({
    $addFields: {
      source,
      libraryKey: '$key',
      format: source === 'pdf' ? 'pdf' : 'epub',
      numericId: NUMERIC_ID_FROM_IMPORT_KEY,
      lengthValue: source === 'pdf' ? '$pageCount' : '$charCount',
      lastReadAt: '$lastReadAt',
      lastUpdate: '$lastUpdate',
    },
  })

  return stages
}

export function parseNumericIdFromLibraryKey(key: string): number {
  const idPart = key.split('.')[0] ?? ''
  const numeric = idPart.startsWith('I') || idPart.startsWith('i') ? idPart.slice(1) : idPart
  return Number.parseInt(numeric, 10) || 0
}

export function normalizeLocalLibraryDocument(
  source: LocalLibrarySource,
  doc: LocalLibraryHakoDocument | LocalLibraryImportDocument,
): NormalizedLocalLibraryRow {
  if (source === 'hako') {
    const hakoDoc = doc as LocalLibraryHakoDocument
    return {
      _id: hakoDoc._id,
      source: 'hako',
      libraryKey: hakoDoc.hakoId,
      title: hakoDoc.title,
      cover: hakoDoc.cover,
      format: 'epub',
      sizeKb: hakoDoc.sizeKb,
      charCount: hakoDoc.charCount,
      numericId: parseNumericIdFromLibraryKey(hakoDoc.hakoId),
      lengthValue: hakoDoc.charCount,
      lastReadAt: hakoDoc.lastReadAt,
      lastUpdate: hakoDoc.lastUpdate,
      seriesUrl: hakoDoc.series_url?.trim() || null,
    }
  }

  const importDoc = doc as LocalLibraryImportDocument
  return {
    _id: importDoc._id,
    source,
    libraryKey: importDoc.key,
    title: importDoc.title,
    cover: importDoc.cover,
    format: source === 'pdf' ? 'pdf' : 'epub',
    sizeKb: importDoc.sizeKb,
    charCount: importDoc.charCount,
    pageCount: importDoc.pageCount,
    numericId: parseNumericIdFromLibraryKey(importDoc.key),
    lengthValue: source === 'pdf' ? importDoc.pageCount : importDoc.charCount,
    lastReadAt: importDoc.lastReadAt,
    lastUpdate: importDoc.lastUpdate,
  }
}

function toIsoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function toReadingProgressDTO(
  progress: LocalLibraryReadingProgressDocument | undefined,
): BookReadingProgressDTO | undefined {
  if (!progress?.locationKey) return undefined

  return {
    activeLocationKey: progress.locationKey,
    locations: [
      {
        locationKey: progress.locationKey,
        spineIndex: progress.spineIndex,
        chapterPath: progress.chapterPath,
        scrollPercent: progress.scrollPercent,
        scrollTop: progress.scrollTop,
        savedAt: toIsoDate(progress.savedAt),
      },
    ],
  }
}

export function toLocalLibraryListItemDTO(row: NormalizedLocalLibraryRow): LocalLibraryListItemDTO {
  const objectId = row._id.toHexString()
  return {
    id: `${row.source}:${objectId}`,
    key: row.libraryKey,
    title: row.title,
    source: row.source,
    format: row.format,
    hasCover: Boolean(row.cover),
    sizeKb: row.sizeKb ?? undefined,
    charCount: row.charCount ?? undefined,
    pageCount: row.pageCount ?? undefined,
    numericId: row.numericId,
    lastReadAt: toIsoDate(row.lastReadAt),
    lastUpdateAt: toIsoDate(row.lastUpdate),
    seriesUrl: row.seriesUrl?.trim() || undefined,
  }
}

export function toLocalLibraryDetailDTO(
  row: NormalizedLocalLibraryRow,
  doc: LocalLibraryHakoDocument | LocalLibraryImportDocument,
): LocalLibraryDetailDTO {
  const base = toLocalLibraryListItemDTO(row)
  const filePath = resolveLocalLibraryFilePath(row.source, doc) ?? undefined
  const hasLiteFile = Boolean(resolveLocalLibraryLiteFilePath(row.source, doc))
  return {
    ...base,
    pdfVersion: 'pdfVersion' in doc ? doc.pdfVersion ?? undefined : undefined,
    filePath,
    canRead: Boolean(filePath),
    hasLiteFile: hasLiteFile || undefined,
    readingProgress: toReadingProgressDTO(doc.readingProgress),
  }
}

// ── List ────────────────────────────────────────────────────────

interface ListLocalLibraryQuery {
  q?: string
  source?: string
  sort?: string
  page: number
  limit: number
}

function sourcesForFilter(source: LocalLibrarySourceFilter): LocalLibrarySource[] {
  switch (source) {
    case 'hako':
      return ['hako']
    case 'epub':
      return ['epub']
    case 'pdf':
      return ['pdf']
    default:
      return ['hako', 'epub', 'pdf']
  }
}

function buildUnionPipeline(
  sources: LocalLibrarySource[],
  q?: string,
  sortFilter?: Record<string, unknown>,
): Document[] {
  const pipeline: Document[] = []
  const [firstSource, ...restSources] = sources

  if (!firstSource) {
    return [{ $match: { _id: null } }]
  }

  const firstMatch = firstSource === 'hako'
    ? buildHakoCollectionMatch(q)
    : buildImportCollectionMatch(q)
  pipeline.push(...buildStagesForSource(firstSource, firstMatch))

  for (const source of restSources) {
    const match = source === 'hako'
      ? buildHakoCollectionMatch(q)
      : buildImportCollectionMatch(q)
    pipeline.push({
      $unionWith: {
        coll: collectionNameForSource(source),
        pipeline: buildStagesForSource(source, match),
      },
    })
  }

  if (sortFilter) {
    pipeline.push({ $match: sortFilter })
  }

  return pipeline
}

function buildStagesForSource(source: LocalLibrarySource, match: Record<string, unknown>): Document[] {
  if (source === 'hako') return buildHakoNormalizeStages(match)
  return buildImportNormalizeStages(source, match)
}

function collectionNameForSource(source: LocalLibrarySource): string {
  switch (source) {
    case 'hako':
      return LOCAL_LIBRARY_CONFIG.collections.hako
    case 'epub':
      return LOCAL_LIBRARY_CONFIG.collections.epub
    case 'pdf':
      return LOCAL_LIBRARY_CONFIG.collections.pdf
  }
}

export async function listLocalLibrary(query: ListLocalLibraryQuery): Promise<LocalLibraryListResponse> {
  const source = normalizeSourceFilter(query.source)
  const sort = normalizeLocalLibrarySort(query.sort)
  const sortFilter = filterForLocalLibrarySort(sort)
  const sources = sourcesForFilter(source)
  const page = query.page
  const limit = query.limit
  const skip = (page - 1) * limit
  const sortStage = toLocalLibraryMongoSort(sort)

  const db = getLocalLibraryDb()
  const baseCollection = collectionNameForSource(sources[0])
  const pipeline = buildUnionPipeline(sources, query.q, sortFilter)

  pipeline.push({
    $facet: {
      total: [{ $count: 'count' }],
      items: [
        { $sort: sortStage },
        { $skip: skip },
        { $limit: limit },
      ],
    },
  })

  const [result] = await db.collection(baseCollection).aggregate<{
    total: Array<{ count: number }>
    items: NormalizedLocalLibraryRow[]
  }>(pipeline).toArray()

  const total = result?.total[0]?.count ?? 0
  const items = (result?.items ?? []).map(toLocalLibraryListItemDTO)

  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  }
}

// ── Reading progress ────────────────────────────────────────────

export class LocalLibraryUpdateError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'LocalLibraryUpdateError'
  }
}

export interface LocalLibraryReadingProgressInput {
  locationKey?: string
  spineIndex?: number
  chapterPath?: string
  scrollPercent?: number
  scrollTop?: number
}

function normalizeProgressNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(min, Math.min(max, value))
}

function collectionForSource(source: LocalLibrarySource) {
  switch (source) {
    case 'hako':
      return getLocalLibraryHakoCollection()
    case 'epub':
      return getLocalLibraryEpubCollection()
    case 'pdf':
      return getLocalLibraryPdfCollection()
  }
}

async function updateDocument(
  source: LocalLibrarySource,
  objectId: import('mongodb').ObjectId,
  update: import('mongodb').UpdateFilter<LocalLibraryHakoDocument | LocalLibraryImportDocument>,
): Promise<LocalLibraryHakoDocument | LocalLibraryImportDocument | null> {
  switch (source) {
    case 'hako':
      return getLocalLibraryHakoCollection().findOneAndUpdate(
        { _id: objectId },
        update,
        { returnDocument: 'after' },
      )
    case 'epub':
      return getLocalLibraryEpubCollection().findOneAndUpdate(
        { _id: objectId },
        update,
        { returnDocument: 'after' },
      )
    case 'pdf':
      return getLocalLibraryPdfCollection().findOneAndUpdate(
        { _id: objectId },
        update,
        { returnDocument: 'after' },
      )
  }
}

async function findDocument(
  source: LocalLibrarySource,
  objectId: import('mongodb').ObjectId,
): Promise<LocalLibraryHakoDocument | LocalLibraryImportDocument | null> {
  return collectionForSource(source).findOne({ _id: objectId })
}

function toDetail(
  source: LocalLibrarySource,
  doc: LocalLibraryHakoDocument | LocalLibraryImportDocument,
): LocalLibraryDetailDTO {
  return toLocalLibraryDetailDTO(normalizeLocalLibraryDocument(source, doc), doc)
}

export async function updateLocalLibraryLastRead(
  id: string,
  locationKey?: string,
): Promise<LocalLibraryDetailDTO> {
  const parsed = parseLocalLibraryItemId(id)
  if (!parsed) {
    throw new LocalLibraryUpdateError('Invalid book id', 400)
  }

  const normalizedLocationKey = typeof locationKey === 'string' ? locationKey.trim() : ''
  const doc = await findDocument(parsed.source, parsed.objectId)
  if (!doc) {
    throw new LocalLibraryUpdateError('Book not found', 404)
  }

  if (normalizedLocationKey && normalizedLocationKey !== id) {
    throw new LocalLibraryUpdateError('Book location not found', 404)
  }

  const now = new Date()
  const setFields: Record<string, unknown> = { lastReadAt: now }
  if (normalizedLocationKey) {
    setFields['readingProgress.locationKey'] = normalizedLocationKey
  }

  const result = await updateDocument(parsed.source, parsed.objectId, { $set: setFields })

  if (!result) {
    throw new LocalLibraryUpdateError('Book not found', 404)
  }

  return toDetail(parsed.source, result)
}

export async function clearLocalLibraryLastRead(id: string): Promise<LocalLibraryDetailDTO> {
  const parsed = parseLocalLibraryItemId(id)
  if (!parsed) {
    throw new LocalLibraryUpdateError('Invalid book id', 400)
  }

  const result = await updateDocument(parsed.source, parsed.objectId, {
    $unset: { lastReadAt: '', readingProgress: '' },
  })

  if (!result) {
    throw new LocalLibraryUpdateError('Book not found', 404)
  }

  return toDetail(parsed.source, result)
}

export async function updateLocalLibraryReadingProgress(
  id: string,
  input: LocalLibraryReadingProgressInput,
): Promise<LocalLibraryDetailDTO> {
  const parsed = parseLocalLibraryItemId(id)
  if (!parsed) {
    throw new LocalLibraryUpdateError('Invalid book id', 400)
  }

  const locationKey = typeof input.locationKey === 'string' ? input.locationKey.trim() : ''
  if (!locationKey) {
    throw new LocalLibraryUpdateError('locationKey is required', 400)
  }

  const doc = await findDocument(parsed.source, parsed.objectId)
  if (!doc) {
    throw new LocalLibraryUpdateError('Book not found', 404)
  }

  if (locationKey !== id) {
    throw new LocalLibraryUpdateError('Book location not found', 404)
  }

  const now = new Date()
  const nextProgress: LocalLibraryReadingProgressDocument = {
    locationKey,
    spineIndex: normalizeProgressNumber(input.spineIndex, 0, Number.MAX_SAFE_INTEGER),
    chapterPath: typeof input.chapterPath === 'string' ? input.chapterPath : undefined,
    scrollPercent: normalizeProgressNumber(input.scrollPercent, 0, 1),
    scrollTop: normalizeProgressNumber(input.scrollTop, 0, Number.MAX_SAFE_INTEGER),
    savedAt: now,
  }

  const result = await updateDocument(parsed.source, parsed.objectId, {
    $set: { readingProgress: nextProgress },
  })

  if (!result) {
    throw new LocalLibraryUpdateError('Book not found', 404)
  }

  return toDetail(parsed.source, result)
}

export function localLibraryItemIdFromDoc(
  source: LocalLibrarySource,
  doc: LocalLibraryHakoDocument | LocalLibraryImportDocument,
): string {
  return toLocalLibraryItemId(source, doc._id)
}

// ── EPUB TOC helpers ────────────────────────────────────────────

const LIST_CHAPTERS_RE = /<ul class="list-chapters">([\s\S]*?)<\/ul>/gi
const INDEX_SPLIT_RE = /^index_split_\d+\.html$/i
const CHAPTER_LINK_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi

export interface DoclnChapterLink {
  url: string
  title: string
  slug: string
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function extractAttr(attrs: string, name: string): string {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const match = attrs.match(re)
  return match ? decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '') : ''
}

export function chapterSlugFromHref(href: string): string {
  const trimmed = href.trim()
  if (!trimmed) return ''

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const path = new URL(trimmed).pathname.replace(/\/+$/, '')
      const last = path.split('/').filter(Boolean).pop() ?? trimmed
      return last.replace(/\.x?html?$/i, '').toLowerCase()
    } catch {
      return trimmed.toLowerCase()
    }
  }

  return trimmed.replace(/\.x?html?$/i, '').toLowerCase()
}

function tocFilesFromZip(files: string[]): string[] {
  const toc = new Set<string>()
  for (const name of files) {
    if (name === 'index.html' || name.endsWith('/index.html')) toc.add(name)
    if (INDEX_SPLIT_RE.test(name)) toc.add(name)
  }
  return [...toc].sort()
}

const INDEX_TOC_HREFS = new Set(['index.html', 'toc.html'])

function extractLinksFromCalibreColItems(html: string, baseUrl = 'https://docln.sbs'): DoclnChapterLink[] {
  const links: DoclnChapterLink[] = []
  const seen = new Set<string>()
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
  let liMatch: RegExpExecArray | null

  while ((liMatch = liRe.exec(html))) {
    const body = liMatch[1]
    if (!/<div\s+class="col"/i.test(body)) continue

    const aMatch = body.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i)
    if (!aMatch) continue

    const href = extractAttr(aMatch[1], 'href')
    if (!href || href.startsWith('#')) continue

    const url = /^https?:\/\//i.test(href) ? href : new URL(href, baseUrl).toString()
    const title = extractAttr(aMatch[1], 'title') || stripTags(aMatch[2])
    const slug = chapterSlugFromHref(url)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    links.push({ url, title: title || slug, slug })
  }

  return links
}

function extractLinksFromListChaptersBlock(blockHtml: string, baseUrl = 'https://docln.sbs'): DoclnChapterLink[] {
  const links: DoclnChapterLink[] = []
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
  let liMatch: RegExpExecArray | null

  while ((liMatch = liRe.exec(blockHtml))) {
    const body = liMatch[1]
    let aMatch: RegExpExecArray | null = null
    CHAPTER_LINK_RE.lastIndex = 0
    while ((aMatch = CHAPTER_LINK_RE.exec(body))) {
      const href = extractAttr(aMatch[1], 'href')
      if (!href || href.startsWith('#')) continue
      const url = /^https?:\/\//i.test(href) ? href : new URL(href, baseUrl).toString()
      const title = extractAttr(aMatch[1], 'title') || stripTags(aMatch[2])
      const slug = chapterSlugFromHref(url)
      if (!slug) continue
      links.push({ url, title: title || slug, slug })
      break
    }
  }

  return links
}

export function extractNcxChapterLinks(ncxXml: string, baseUrl = 'https://docln.sbs'): DoclnChapterLink[] {
  const links: DoclnChapterLink[] = []
  const seen = new Set<string>()
  const navPointRe = /<navPoint\b[^>]*playOrder="(\d+)"[^>]*>([\s\S]*?)<\/navPoint>/gi
  const entries: Array<{ playOrder: number; link: DoclnChapterLink }> = []
  let navMatch: RegExpExecArray | null

  while ((navMatch = navPointRe.exec(ncxXml))) {
    const playOrder = Number(navMatch[1])
    const body = navMatch[2]
    const titleMatch = body.match(/<text>([^<]*)<\/text>/i)
    const contentMatch = body.match(/<content\s+src="([^"]+)"\s*\/>/i)
    if (!titleMatch || !contentMatch) continue

    const href = decodeHtmlEntities(contentMatch[1].trim())
    const basename = href.split('/').pop()?.toLowerCase() ?? ''
    if (INDEX_TOC_HREFS.has(basename)) continue

    const url = /^https?:\/\//i.test(href) ? href : new URL(href, baseUrl).toString()
    const title = decodeHtmlEntities(titleMatch[1].trim())
    const slug = chapterSlugFromHref(url)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    entries.push({
      playOrder: Number.isFinite(playOrder) ? playOrder : entries.length + 1,
      link: { url, title: title || slug, slug },
    })
  }

  entries.sort((left, right) => left.playOrder - right.playOrder)
  for (const entry of entries) links.push(entry.link)
  return links
}

export function extractListChapterLinks(html: string, baseUrl = 'https://docln.sbs'): DoclnChapterLink[] {
  const links: DoclnChapterLink[] = []
  const seen = new Set<string>()

  for (const blockMatch of html.matchAll(LIST_CHAPTERS_RE)) {
    for (const link of extractLinksFromListChaptersBlock(blockMatch[1], baseUrl)) {
      if (seen.has(link.slug)) continue
      seen.add(link.slug)
      links.push(link)
    }
  }

  if (links.length) return links

  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
  let liMatch: RegExpExecArray | null
  while ((liMatch = liRe.exec(html))) {
    const body = liMatch[1]
    if (!/\bchapter-name\b/i.test(body)) continue

    const aMatch = body.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i)
    if (!aMatch) continue

    const href = extractAttr(aMatch[1], 'href')
    if (!href) continue
    const url = new URL(href, baseUrl).toString()
    const title = extractAttr(aMatch[1], 'title') || stripTags(aMatch[2])
    const slug = chapterSlugFromHref(url)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    links.push({ url, title: title || slug, slug })
  }

  if (links.length) return links

  return extractLinksFromCalibreColItems(html, baseUrl)
}

export async function extractListChapterLinksFromEpubBuffer(buffer: Buffer): Promise<DoclnChapterLink[]> {
  const zip = await JSZip.loadAsync(buffer)
  const tocFiles = tocFilesFromZip(Object.keys(zip.files))
  if (!tocFiles.length) return []

  const merged: DoclnChapterLink[] = []
  const seen = new Set<string>()
  for (const tocName of tocFiles) {
    const entry = zip.file(tocName)
    if (!entry) continue
    const html = await entry.async('string')
    for (const link of extractListChapterLinks(html)) {
      if (seen.has(link.slug)) continue
      seen.add(link.slug)
      merged.push(link)
    }
  }

  if (merged.length) return merged

  const ncxName = Object.keys(zip.files).find(name => /(?:^|\/)toc\.ncx$/i.test(name) || /(?:^|\/)nav\.ncx$/i.test(name))
  if (!ncxName) return []

  const entry = zip.file(ncxName)
  if (!entry) return []

  const ncxXml = await entry.async('string')
  return extractNcxChapterLinks(ncxXml)
}

// ── Book TOC ────────────────────────────────────────────────────

export class LocalLibraryTocError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'LocalLibraryTocError'
  }
}

export interface LocalLibraryTocChapterDTO {
  title: string
  href: string
  slug: string
}

export interface LocalLibraryTocDTO {
  chapters: LocalLibraryTocChapterDTO[]
}

export async function getLocalLibraryBookToc(bookId: string): Promise<LocalLibraryTocDTO> {
  const parsed = parseLocalLibraryItemId(bookId)
  if (!parsed) {
    throw new LocalLibraryTocError('Invalid book id', 400)
  }
  if (parsed.source === 'pdf') {
    return { chapters: [] }
  }

  const doc = parsed.source === 'hako'
    ? await getLocalLibraryHakoCollection().findOne({ _id: parsed.objectId })
    : await getLocalLibraryEpubCollection().findOne({ _id: parsed.objectId })
  if (!doc) {
    throw new LocalLibraryTocError('Book not found', 404)
  }

  // Prefer lite EPUB for TOC — same chapter list, much smaller read on heavy books.
  const litePath = resolveLocalLibraryLiteFilePath(parsed.source, doc)
  const filePath = litePath ?? resolveLocalLibraryFilePath(parsed.source, doc)
  if (!filePath) {
    throw new LocalLibraryTocError('Book EPUB file path could not be resolved', 400, 'missing_file_path')
  }

  const links = await extractListChapterLinksFromEpubBuffer(readFileSync(filePath))
  return {
    chapters: links.map(link => ({
      title: link.title,
      href: link.url,
      slug: link.slug,
    })),
  }
}
