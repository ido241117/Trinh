import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePlayer } from './usePlayer'
import type { TrackDTO } from '../types'

const CURRENT_TRACK_STORAGE_KEY = 'player-current-track-id'
const REPEAT_MODE_STORAGE_KEY = 'player-repeat-mode'
const SHUFFLE_STORAGE_KEY = 'player-shuffle'

const tracks: TrackDTO[] = [
  { id: 't1', filename: 'Track One', dateModified: '2025-01-01T00:00:00.000Z', duration: 180, format: 'mp3', hasCover: false },
  { id: 't2', filename: 'Track Two', dateModified: '2025-01-02T00:00:00.000Z', duration: 240, format: 'wav', hasCover: false },
  { id: 't3', filename: 'Track Three', dateModified: '2025-01-03T00:00:00.000Z', duration: 120, format: 'flac', hasCover: true },
]

describe('usePlayer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts with no current track', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    expect(result.current.currentTrackId).toBeNull()
    expect(result.current.isPlaying).toBe(false)
  })

  it('restores the last track from localStorage but stays paused', () => {
    localStorage.setItem(CURRENT_TRACK_STORAGE_KEY, 't2')

    const { result } = renderHook(() => usePlayer(tracks))

    expect(result.current.currentTrackId).toBe('t2')
    expect(result.current.currentTrack?.filename).toBe('Track Two')
    expect(result.current.isPlaying).toBe(false)
  })

  it('play sets currentTrackId and isPlaying', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => result.current.play('t1'))
    expect(result.current.currentTrackId).toBe('t1')
    expect(result.current.isPlaying).toBe(true)
  })

  it('persists the current track id to localStorage and clears it on stop', async () => {
    const { result } = renderHook(() => usePlayer(tracks))

    act(() => result.current.play('t1'))
    await waitFor(() => expect(localStorage.getItem(CURRENT_TRACK_STORAGE_KEY)).toBe('t1'))

    act(() => result.current.stop())
    await waitFor(() => expect(localStorage.getItem(CURRENT_TRACK_STORAGE_KEY)).toBeNull())
  })

  it('restores repeat mode from localStorage', () => {
    localStorage.setItem(REPEAT_MODE_STORAGE_KEY, 'all')

    const { result } = renderHook(() => usePlayer(tracks))

    expect(result.current.repeat).toBe('all')
  })

  it('persists repeat mode to localStorage', async () => {
    const { result } = renderHook(() => usePlayer(tracks))

    act(() => result.current.setRepeat('one'))

    await waitFor(() => expect(localStorage.getItem(REPEAT_MODE_STORAGE_KEY)).toBe('one'))
  })

  it('restores shuffle mode from localStorage', () => {
    localStorage.setItem(SHUFFLE_STORAGE_KEY, '1')

    const { result } = renderHook(() => usePlayer(tracks))

    expect(result.current.shuffle).toBe(true)
  })

  it('persists shuffle mode to localStorage', async () => {
    const { result } = renderHook(() => usePlayer(tracks))

    act(() => result.current.setShuffle(true))

    await waitFor(() => expect(localStorage.getItem(SHUFFLE_STORAGE_KEY)).toBe('1'))
  })

  it('pause sets isPlaying to false', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => result.current.play('t1'))
    act(() => result.current.pause())
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTrackId).toBe('t1')
  })

  it('togglePlay flips isPlaying', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => result.current.play('t1'))
    act(() => result.current.togglePlay())
    expect(result.current.isPlaying).toBe(false)
    act(() => result.current.togglePlay())
    expect(result.current.isPlaying).toBe(true)
  })

  it('next advances to next track', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => result.current.play('t1'))
    act(() => result.current.next())
    expect(result.current.currentTrackId).toBe('t2')
  })

  it('prev goes to previous track', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => result.current.play('t2'))
    act(() => result.current.prev())
    expect(result.current.currentTrackId).toBe('t1')
  })

  it('next wraps around to first when at end (repeat all)', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => { result.current.play('t3'); result.current.setRepeat('all') })
    act(() => result.current.next())
    expect(result.current.currentTrackId).toBe('t1')
  })

  it('next stops at end when repeat is off', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => result.current.play('t3'))
    act(() => result.current.next())
    expect(result.current.currentTrackId).toBe('t3')
    expect(result.current.isPlaying).toBe(false)
  })

  it('shuffle plays a random track from the list', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => { result.current.play('t1'); result.current.setShuffle(true) })
    act(() => result.current.next())
    expect(tracks.map(t => t.id)).toContain(result.current.currentTrackId)
  })

  it('repeat one: next replays same track', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => { result.current.play('t2'); result.current.setRepeat('one') })
    act(() => result.current.next())
    expect(result.current.currentTrackId).toBe('t2')
  })

  it('currentTrack returns the full TrackDTO', () => {
    const { result } = renderHook(() => usePlayer(tracks))
    act(() => result.current.play('t2'))
    expect(result.current.currentTrack?.filename).toBe('Track Two')
  })

  // B-03: currentTrack must persist even when filtered out of tracks list
  it('currentTrack stays set when track is no longer in tracks list', () => {
    const { result, rerender } = renderHook(
      ({ t }) => usePlayer(t),
      { initialProps: { t: tracks } }
    )
    act(() => result.current.play('t1'))
    // Simulate search filtering out t1
    rerender({ t: [tracks[1], tracks[2]] })
    expect(result.current.currentTrack?.id).toBe('t1')
    expect(result.current.currentTrackId).toBe('t1')
  })
})
