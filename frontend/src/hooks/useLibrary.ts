import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { fetchLibrary, fetchLibraryPage, rescanLibrary } from '../api'
import type { TrackDTO, SortField, SortOrder, LibraryDateFilterMode } from '../types'

const MOBILE_PAGE_SIZE = 80
const MUSIC_FILTER_MODE_STORAGE_KEY = 'music-filter-mode'
const MUSIC_FILTER_MONTH_STORAGE_KEY = 'music-filter-month'

interface UseLibraryOptions {
  paginated?: boolean
}

function readStoredDateFilter(): { mode: LibraryDateFilterMode; month?: string } {
  let mode: LibraryDateFilterMode = 'last30'
  try {
    const rawMode = window.localStorage.getItem(MUSIC_FILTER_MODE_STORAGE_KEY)
    if (rawMode === 'default' || rawMode === 'month' || rawMode === 'monthAllYears' || rawMode === 'last30') {
      mode = rawMode
    }
  } catch {
    // ignore storage errors
  }

  let month: string | undefined
  try {
    const rawMonth = window.localStorage.getItem(MUSIC_FILTER_MONTH_STORAGE_KEY)
    if (rawMonth && /^\d{4}-\d{2}$/.test(rawMonth)) {
      month = rawMonth
    }
  } catch {
    // ignore storage errors
  }

  return { mode, month }
}

function mergeTracks(existing: TrackDTO[], incoming: TrackDTO[]): TrackDTO[] {
  if (incoming.length === 0) return existing
  const seen = new Set(existing.map(track => track.id))
  const merged = [...existing]
  for (const track of incoming) {
    if (seen.has(track.id)) continue
    seen.add(track.id)
    merged.push(track)
  }
  return merged
}

export function useLibrary(options?: UseLibraryOptions) {
  const paginated = options?.paginated ?? false
  const [tracks, setTracks] = useState<TrackDTO[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('dateModified')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [dateFilter, setDateFilterState] = useState<{ mode: LibraryDateFilterMode; month?: string }>(
    () => readStoredDateFilter(),
  )
  const requestVersionRef = useRef(0)
  const [listResetKey, setListResetKey] = useState(0)

  const pageQuery = useMemo(() => ({
    sort: sortField,
    order: sortOrder,
    search,
    filter: dateFilter.mode,
    month: dateFilter.month,
  }), [sortField, sortOrder, search, dateFilter.mode, dateFilter.month])

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    const requestVersion = ++requestVersionRef.current
    const data = await fetchLibraryPage({
      ...pageQuery,
      limit: MOBILE_PAGE_SIZE,
      offset,
    })

    if (requestVersion !== requestVersionRef.current) return

    setTracks(prev => append ? mergeTracks(prev, data.items) : data.items)
    if (!append) {
      setListResetKey(key => key + 1)
    }
    setTotalCount(data.total)
    setHasMore(data.hasMore)
    setError(null)
  }, [pageQuery])

  useEffect(() => {
    if (paginated) return

    fetchLibrary()
      .then(setTracks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [paginated])

  useEffect(() => {
    if (!paginated) return

    setLoading(true)
    loadPage(0, false)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [paginated, loadPage])

  const loadMore = useCallback(async () => {
    if (!paginated || !hasMore || loadingMore || loading) return
    setLoadingMore(true)
    try {
      await loadPage(tracks.length, true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }, [paginated, hasMore, loadingMore, loading, tracks.length, loadPage])

  const setDateFilter = useCallback((mode: LibraryDateFilterMode, month?: string) => {
    setDateFilterState({ mode, month })
  }, [])

  const filtered = useMemo(() => {
    if (paginated) return tracks

    let result = tracks
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t => t.filename.toLowerCase().includes(q))
    }
    return [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'dateModified') {
        cmp = new Date(a.dateModified).getTime() - new Date(b.dateModified).getTime()
      } else if (sortField === 'filename') {
        cmp = a.filename.localeCompare(b.filename)
      } else if (sortField === 'duration') {
        cmp = a.duration - b.duration
      }
      return sortOrder === 'desc' ? -cmp : cmp
    })
  }, [paginated, tracks, search, sortField, sortOrder])

  const rescan = useCallback(async () => {
    setLoading(true)
    try {
      await rescanLibrary()
      if (paginated) {
        await loadPage(0, false)
      } else {
        const data = await fetchLibrary()
        setTracks(data)
      }
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [paginated, loadPage])

  const upsertTrack = useCallback((track: TrackDTO) => {
    setTracks(prev => {
      const idx = prev.findIndex(t => t.id === track.id)
      if (idx === -1) return [...prev, track]
      const next = [...prev]
      // The server returns the complete current document, so replace it
      // wholesale — a shallow merge would keep fields the server removed
      // (e.g. `artist` after it was cleared back to "no artist").
      next[idx] = track
      return next
    })
  }, [])

  const removeTrack = useCallback((id: string) => {
    setTracks(prev => prev.filter(t => t.id !== id))
    if (paginated) {
      setTotalCount(prev => Math.max(0, prev - 1))
    }
  }, [paginated])

  const isEmpty = !loading && (paginated ? totalCount === 0 : tracks.length === 0)

  return {
    tracks: filtered,
    isEmpty,
    loading,
    loadingMore,
    hasMore,
    totalCount,
    paginated,
    listResetKey,
    error,
    search,
    setSearch,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    setDateFilter,
    loadMore,
    rescan,
    upsertTrack,
    removeTrack,
  }
}
