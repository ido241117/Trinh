import { Collection, ObjectId } from 'mongodb'
import { LOCAL_LIBRARY_CONFIG } from '../config/local-library.js'
import { getLocalLibraryDb } from '../db.js'

export type LocalLibrarySource = 'hako' | 'epub' | 'pdf'

export interface LocalLibraryReadingProgressDocument {
  locationKey: string
  spineIndex?: number
  chapterPath?: string
  scrollPercent?: number
  scrollTop?: number
  savedAt?: Date | string
}

export interface LocalLibraryHakoDocument {
  _id: ObjectId
  hakoId: string
  title: string
  cover?: string | null
  series_url?: string | null
  lastUpdate?: Date | string | null
  charCount?: number | null
  /** @deprecated Ignored — all books resolve under local D:\Data paths. */
  drive?: string | null
  sizeKb?: number | null
  lastReadAt?: Date | string | null
  readingProgress?: LocalLibraryReadingProgressDocument
}

export interface LocalLibraryImportDocument {
  _id: ObjectId
  key: string
  title: string
  cover?: string | null
  lastUpdate?: Date | string | null
  /** @deprecated Ignored — all books resolve under local D:\Data paths. */
  drive?: string | null
  sizeKb?: number | null
  charCount?: number | null
  pageCount?: number | null
  pdfVersion?: string | null
  importSourceName?: string | null
  importSourceSizeBytes?: number | null
  lastReadAt?: Date | string | null
  readingProgress?: LocalLibraryReadingProgressDocument
}

export function getLocalLibraryHakoCollection(): Collection<LocalLibraryHakoDocument> {
  return getLocalLibraryDb().collection<LocalLibraryHakoDocument>(LOCAL_LIBRARY_CONFIG.collections.hako)
}

export function getLocalLibraryEpubCollection(): Collection<LocalLibraryImportDocument> {
  return getLocalLibraryDb().collection<LocalLibraryImportDocument>(LOCAL_LIBRARY_CONFIG.collections.epub)
}

export function getLocalLibraryPdfCollection(): Collection<LocalLibraryImportDocument> {
  return getLocalLibraryDb().collection<LocalLibraryImportDocument>(LOCAL_LIBRARY_CONFIG.collections.pdf)
}

export function parseLocalLibraryItemId(value: string): { source: LocalLibrarySource; objectId: ObjectId } | null {
  const match = value.match(/^(hako|epub|pdf):([a-f0-9]{24})$/i)
  if (!match || !ObjectId.isValid(match[2])) return null
  return {
    source: match[1] as LocalLibrarySource,
    objectId: new ObjectId(match[2]),
  }
}

export function toLocalLibraryItemId(source: LocalLibrarySource, id: ObjectId): string {
  return `${source}:${id.toHexString()}`
}
