import { describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import { join } from 'path'
import { LOCAL_LIBRARY_CONFIG, getStorageMounts } from '../src/config/local-library.js'
import {
  buildHakoCollectionMatch,
  buildImportCollectionMatch,
  filterForLocalLibrarySort,
  normalizeLocalLibraryDocument,
  normalizeSourceFilter,
  parseNumericIdFromLibraryKey,
  resolveLocalLibraryFilePath,
  resolveLocalLibraryLiteFilePath,
  toLocalLibraryListItemDTO,
  toLocalLibraryMongoSort,
} from '../src/services/book-read-service.js'

describe('resolveLocalLibraryFilePath', () => {
  it('resolves hako books on D: when drive is null', () => {
    const path = resolveLocalLibraryFilePath('hako', {
      _id: new ObjectId(),
      hakoId: '42.epub',
      title: 'Sample',
      drive: null,
    })

    expect(path).toBe(join(LOCAL_LIBRARY_CONFIG.hakoBookDir, '42.epub'))
  })

  it('resolves hako books on cold storage when drive is set', () => {
    const [email, mount] = Object.entries(getStorageMounts())[0] ?? []
    if (!email || !mount) {
      throw new Error('OFFLINE_STORAGE_MOUNTS must be set for cold storage test')
    }

    const path = resolveLocalLibraryFilePath('hako', {
      _id: new ObjectId(),
      hakoId: '42.epub',
      title: 'Sample',
      drive: email,
    })

    expect(path).toBe(join(mount, LOCAL_LIBRARY_CONFIG.hakoSubdir, '42.epub'))
  })

  it('resolves import books by key under the Import folder on D:', () => {
    const path = resolveLocalLibraryFilePath('epub', {
      _id: new ObjectId(),
      key: 'I24841.epub',
      title: 'Sample',
      drive: null,
    })

    expect(path).toBe(join(LOCAL_LIBRARY_CONFIG.importDir, 'I24841.epub'))
  })

  it('does not resolve lite EPUB for cold-storage or import books', () => {
    expect(resolveLocalLibraryLiteFilePath('epub', {
      _id: new ObjectId(),
      key: 'I24841.epub',
      title: 'Sample',
      drive: null,
    })).toBeNull()

    const [email] = Object.entries(getStorageMounts())[0] ?? []
    if (!email) {
      throw new Error('OFFLINE_STORAGE_MOUNTS must be set for cold storage test')
    }

    expect(resolveLocalLibraryLiteFilePath('hako', {
      _id: new ObjectId(),
      hakoId: '42.epub',
      title: 'Sample',
      drive: email,
    })).toBeNull()
  })
})

describe('local library filters', () => {
  it('matches hako books by numeric id', () => {
    expect(buildHakoCollectionMatch('123')).toEqual({ hakoId: '123.epub' })
  })

  it('matches import books by numeric id with I prefix variants', () => {
    expect(buildImportCollectionMatch('24841')).toEqual({
      key: { $in: ['I24841.epub', 'I24841.pdf', '24841.epub', '24841.pdf'] },
    })
    expect(buildImportCollectionMatch('I24841')).toEqual({
      key: { $in: ['I24841.epub', 'I24841.pdf', '24841.epub', '24841.pdf'] },
    })
  })

  it('normalizes source filter values', () => {
    expect(normalizeSourceFilter('hako')).toBe('hako')
    expect(normalizeSourceFilter('epub')).toBe('epub')
    expect(normalizeSourceFilter('pdf')).toBe('pdf')
    expect(normalizeSourceFilter('unknown')).toBe('all')
  })
})

describe('local library sort', () => {
  it('defaults to hako id descending', () => {
    expect(toLocalLibraryMongoSort()).toEqual({ numericId: -1, title: 1 })
    expect(toLocalLibraryMongoSort('title_asc')).toEqual({ title: 1 })
    expect(toLocalLibraryMongoSort('size_desc')).toEqual({ sizeKb: -1, title: 1 })
    expect(toLocalLibraryMongoSort('last_read_desc')).toEqual({ lastReadAt: -1, title: 1 })
    expect(toLocalLibraryMongoSort('last_update_desc')).toEqual({ lastUpdate: -1, numericId: -1 })
  })

  it('filters out rows missing the sort field', () => {
    expect(filterForLocalLibrarySort('hako_id_desc')).toEqual({
      source: 'hako',
      numericId: { $gt: 0 },
    })
    expect(filterForLocalLibrarySort('length_asc')).toEqual({
      source: { $in: ['hako', 'epub'] },
      lengthValue: { $type: 'number' },
    })
    expect(filterForLocalLibrarySort('size_desc')).toEqual({
      sizeKb: { $type: 'number' },
    })
    expect(filterForLocalLibrarySort('last_read_desc')).toEqual({
      lastReadAt: { $nin: [null, ''] },
    })
    expect(filterForLocalLibrarySort('last_update_desc')).toEqual({
      lastUpdate: { $nin: [null, ''] },
    })
    expect(filterForLocalLibrarySort('title_asc')).toBeUndefined()
  })
})

describe('local library DTO mapping', () => {
  it('maps hako documents', () => {
    const dto = toLocalLibraryListItemDTO(normalizeLocalLibraryDocument('hako', {
      _id: new ObjectId('65f000000000000000000001'),
      hakoId: '42.epub',
      title: 'Sample Hako',
      cover: 'cover.jpg',
      charCount: 1200,
      sizeKb: 88.5,
      lastUpdate: new Date('2020-07-19T17:00:00.000Z'),
    }))

    expect(dto).toEqual({
      id: 'hako:65f000000000000000000001',
      key: '42.epub',
      title: 'Sample Hako',
      source: 'hako',
      format: 'epub',
      hasCover: true,
      sizeKb: 88.5,
      charCount: 1200,
      numericId: 42,
      lastUpdateAt: '2020-07-19T17:00:00.000Z',
    })
  })

  it('parses import numeric ids from I-prefixed keys', () => {
    expect(parseNumericIdFromLibraryKey('I24841.epub')).toBe(24841)
    expect(parseNumericIdFromLibraryKey('26001.pdf')).toBe(26001)
  })
})
