import { useCallback, useEffect, useState } from 'react'
import { fetchLocalLibrary } from '../api'
import type {
  LocalLibraryListItemDTO,
  LocalLibrarySort,
  LocalLibrarySourceFilter,
} from '../types'

interface LocalLibraryQuery {
  search: string
  sort: LocalLibrarySort
  source: LocalLibrarySourceFilter
}

const LOCAL_LIBRARY_QUERY_STORAGE_KEY = 'local-library-query'

const SORT_VALUES: LocalLibrarySort[] = [
  '',
  'hako_id_asc',
  'hako_id_desc',
  'title_asc',
  'title_desc',
  'length_asc',
  'length_desc',
  'size_asc',
  'size_desc',
  'last_read_asc',
  'last_read_desc',
  'last_update_asc',
  'last_update_desc',
]

const SOURCE_VALUES: LocalLibrarySourceFilter[] = ['all', 'hako', 'epub', 'pdf']

const DEFAULT_QUERY: LocalLibraryQuery = {
  search: '',
  sort: 'size_desc',
  source: 'all',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readStoredQuery(): LocalLibraryQuery {
  try {
    const raw = window.localStorage.getItem(LOCAL_LIBRARY_QUERY_STORAGE_KEY)
    if (!raw) return DEFAULT_QUERY

    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return DEFAULT_QUERY

    return {
      search: typeof parsed.search === 'string' ? parsed.search : DEFAULT_QUERY.search,
      sort: SORT_VALUES.includes(parsed.sort as LocalLibrarySort)
        ? parsed.sort as LocalLibrarySort
        : DEFAULT_QUERY.sort,
      source: SOURCE_VALUES.includes(parsed.source as LocalLibrarySourceFilter)
        ? parsed.source as LocalLibrarySourceFilter
        : DEFAULT_QUERY.source,
    }
  } catch {
    return DEFAULT_QUERY
  }
}

export function useLocalLibrary() {
  const initialQuery = useState(readStoredQuery)[0]
  const [books, setBooks] = useState<LocalLibraryListItemDTO[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState(initialQuery.search)
  const [sort, setSort] = useState<LocalLibrarySort>(initialQuery.sort)
  const [source, setSource] = useState<LocalLibrarySourceFilter>(initialQuery.source)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(async (nextPage: number, query: LocalLibraryQuery, append: boolean) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const result = await fetchLocalLibrary({
        q: query.search,
        page: nextPage,
        limit: 200,
        sort: query.sort,
        source: query.source,
      })
      setBooks(prev => (append ? [...prev, ...result.items] : result.items))
      setTotal(result.total)
      setPage(result.page)
      setHasMore(result.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch local library')
      if (!append) setBooks([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadPage(1, { search, sort, source }, false)
    }, search ? 250 : 0)

    return () => window.clearTimeout(timer)
  }, [search, sort, source, loadPage])

  useEffect(() => {
    window.localStorage.setItem(
      LOCAL_LIBRARY_QUERY_STORAGE_KEY,
      JSON.stringify({ search, sort, source }),
    )
  }, [search, sort, source])

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return
    loadPage(page + 1, { search, sort, source }, true)
  }, [hasMore, loadingMore, loading, loadPage, page, search, sort, source])

  const refresh = useCallback(() => {
    loadPage(1, { search, sort, source }, false)
  }, [loadPage, search, sort, source])

  const removeBook = useCallback((bookId: string) => {
    setBooks(prev => prev.filter(book => book.id !== bookId))
    setTotal(prev => Math.max(0, prev - 1))
  }, [])

  /** Reload currently loaded pages without full-page spinner (keeps list mounted for scroll restore). */
  const softRefresh = useCallback(async () => {
    const pagesToLoad = Math.max(1, page)
    const query: LocalLibraryQuery = { search, sort, source }
    setError(null)

    try {
      const collected: LocalLibraryListItemDTO[] = []
      let lastHasMore = false
      let lastPage = 1
      let lastTotal = 0

      for (let nextPage = 1; nextPage <= pagesToLoad; nextPage += 1) {
        const result = await fetchLocalLibrary({
          q: query.search,
          page: nextPage,
          limit: 200,
          sort: query.sort,
          source: query.source,
        })
        collected.push(...result.items)
        lastHasMore = result.hasMore
        lastPage = result.page
        lastTotal = result.total
        if (!result.hasMore) break
      }

      setBooks(collected)
      setTotal(lastTotal)
      setPage(lastPage)
      setHasMore(lastHasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch local library')
    }
  }, [page, search, sort, source])

  return {
    books,
    total,
    search,
    setSearch,
    sort,
    setSort,
    source,
    setSource,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    softRefresh,
    removeBook,
  }
}
