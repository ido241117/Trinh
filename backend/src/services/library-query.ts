import type { Filter } from 'mongodb'
import type { TrackDocument } from '../models/track.model.js'

export type LibraryDateFilterMode = 'default' | 'month' | 'monthAllYears' | 'last30'
export type LibrarySortField = 'dateModified' | 'filename' | 'duration'
export type LibrarySortOrder = 'asc' | 'desc'

export interface LibraryQueryParams {
  search?: string
  filter?: LibraryDateFilterMode
  month?: string
  sort?: LibrarySortField
  order?: LibrarySortOrder
  limit?: number
  offset?: number
}

const DEFAULT_PAGE_SIZE = 80
const MAX_PAGE_SIZE = 200

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseDateFilterMode(value: unknown): LibraryDateFilterMode {
  if (value === 'month' || value === 'monthAllYears' || value === 'last30' || value === 'default') {
    return value
  }
  return 'default'
}

function parseSortField(value: unknown): LibrarySortField {
  if (value === 'filename' || value === 'duration' || value === 'dateModified') {
    return value
  }
  return 'dateModified'
}

function parseSortOrder(value: unknown): LibrarySortOrder {
  return value === 'asc' ? 'asc' : 'desc'
}

export function parseLibraryQueryParams(query: Record<string, unknown>): LibraryQueryParams {
  const parsed: LibraryQueryParams = {
    search: typeof query.search === 'string' ? query.search : undefined,
    filter: parseDateFilterMode(query.filter),
    month: typeof query.month === 'string' ? query.month : undefined,
    sort: parseSortField(query.sort),
    order: parseSortOrder(query.order),
  }

  if (query.limit !== undefined) {
    const limit = Number(query.limit)
    if (Number.isFinite(limit) && limit > 0) {
      parsed.limit = Math.min(Math.floor(limit), MAX_PAGE_SIZE)
    } else {
      parsed.limit = DEFAULT_PAGE_SIZE
    }
  }

  if (query.offset !== undefined) {
    const offset = Number(query.offset)
    parsed.offset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0
  }

  return parsed
}

export function buildLibraryMongoFilter(params: Pick<LibraryQueryParams, 'search' | 'filter' | 'month'>): Filter<TrackDocument> {
  const clauses: Filter<TrackDocument>[] = []
  const search = params.search?.trim()

  if (search) {
    clauses.push({ filename: { $regex: escapeRegex(search), $options: 'i' } })
  }

  switch (params.filter) {
    case 'last30': {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      cutoff.setHours(0, 0, 0, 0)
      clauses.push({ dateModified: { $gt: cutoff.toISOString() } })
      break
    }
    case 'month': {
      if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
        clauses.push({ dateModified: { $regex: `^${params.month}` } })
      }
      break
    }
    case 'monthAllYears': {
      if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
        const monthPart = params.month.split('-')[1]
        clauses.push({ dateModified: { $regex: `-${monthPart}-` } })
      }
      break
    }
    default:
      break
  }

  if (clauses.length === 0) return {}
  if (clauses.length === 1) return clauses[0]
  return { $and: clauses }
}

export function buildLibraryMongoSort(
  sort: LibrarySortField = 'dateModified',
  order: LibrarySortOrder = 'desc',
): Record<string, 1 | -1> {
  return { [sort]: order === 'asc' ? 1 : -1 }
}

export function trackDocumentToDTO(doc: TrackDocument) {
  const { _id, absolutePath: _path, scannedAt: _ts, ...rest } = doc
  return { id: _id, ...rest }
}
