import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useLibrary } from './useLibrary'
import type { TrackDTO } from '../types'

const mockTracks: TrackDTO[] = [
  { id: 'a1', filename: 'Zebra Song', dateModified: '2025-03-01T00:00:00.000Z', duration: 200, format: 'mp3', hasCover: false },
  { id: 'b2', filename: 'Apple Track', dateModified: '2025-01-01T00:00:00.000Z', duration: 100, format: 'wav', hasCover: false },
  { id: 'c3', filename: 'Mango Beat', dateModified: '2025-06-01T00:00:00.000Z', duration: 300, format: 'flac', artist: 'DJ Mango', hasCover: true },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockTracks),
  }))
})

describe('useLibrary', () => {
  it('starts in loading state', () => {
    const { result } = renderHook(() => useLibrary())
    expect(result.current.loading).toBe(true)
  })

  it('fetches tracks on mount', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tracks).toHaveLength(3)
    expect(fetch).toHaveBeenCalledWith('/api/library')
  })

  it('default sort is dateModified descending', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const dates = result.current.tracks.map(t => t.dateModified)
    expect(dates[0] > dates[1]).toBe(true)
    expect(dates[1] > dates[2]).toBe(true)
  })

  it('filters by search query (case-insensitive)', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.setSearch('mango'))
    expect(result.current.tracks).toHaveLength(1)
    expect(result.current.tracks[0].filename).toBe('Mango Beat')
  })

  it('sorts by filename ascending', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.setSortField('filename'); result.current.setSortOrder('asc') })
    expect(result.current.tracks[0].filename).toBe('Apple Track')
    expect(result.current.tracks[2].filename).toBe('Zebra Song')
  })

  it('sorts by duration descending', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.setSortField('duration'); result.current.setSortOrder('desc') })
    expect(result.current.tracks[0].duration).toBe(300)
    expect(result.current.tracks[2].duration).toBe(100)
  })

  it('rescan calls POST /api/library/scan', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(() => result.current.rescan())
    expect(fetch).toHaveBeenCalledWith('/api/library/scan', { method: 'POST' })
  })

  it('upsertTrack updates existing track without fetching', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.upsertTrack({
        ...mockTracks[0],
        filename: 'Renamed Zebra',
      })
    })
    expect(result.current.tracks.find(t => t.id === 'a1')?.filename).toBe('Renamed Zebra')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('upsertTrack removes artist when the server DTO omits it', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const { artist: _stale, ...noArtist } = mockTracks[2]
    act(() => {
      result.current.upsertTrack({ ...noArtist })
    })
    expect(result.current.tracks.find(t => t.id === 'c3')?.artist).toBeUndefined()
  })

  it('removeTrack drops a track without fetching', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.removeTrack('a1'))
    expect(result.current.tracks.find(t => t.id === 'a1')).toBeUndefined()
    expect(result.current.tracks).toHaveLength(2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('isEmpty is true when library loads with no tracks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }))
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isEmpty).toBe(true)
  })

  it('isEmpty is false when tracks are loaded', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isEmpty).toBe(false)
  })
})
