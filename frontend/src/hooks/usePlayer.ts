import { useEffect, useState, useCallback } from 'react'
import type { TrackDTO } from '../types'

export type RepeatMode = 'off' | 'one' | 'all'

const CURRENT_TRACK_STORAGE_KEY = 'player-current-track-id'
const REPEAT_MODE_STORAGE_KEY = 'player-repeat-mode'
const SHUFFLE_STORAGE_KEY = 'player-shuffle'

function readStoredCurrentTrackId(): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_TRACK_STORAGE_KEY)
    return raw && raw.trim() ? raw : null
  } catch {
    return null
  }
}

function readStoredRepeatMode(): RepeatMode {
  try {
    const raw = localStorage.getItem(REPEAT_MODE_STORAGE_KEY)
    if (raw === 'off' || raw === 'one' || raw === 'all') return raw
  } catch {
    // ignore storage errors
  }
  return 'off'
}

function readStoredShuffle(): boolean {
  try {
    return localStorage.getItem(SHUFFLE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function usePlayer(tracks: TrackDTO[]) {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(readStoredCurrentTrackId)
  // B-03: store currentTrack as state so it persists when search filters it out
  const [currentTrack, setCurrentTrack] = useState<TrackDTO | null>(() => {
    const storedId = readStoredCurrentTrackId()
    return tracks.find(t => t.id === storedId) ?? null
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const [shuffle, setShuffleState] = useState(readStoredShuffle)
  const [repeat, setRepeatState] = useState<RepeatMode>(readStoredRepeatMode)

  useEffect(() => {
    if (!currentTrackId || currentTrack) return
    const track = tracks.find(t => t.id === currentTrackId) ?? null
    if (track) setCurrentTrack(track)
  }, [currentTrack, currentTrackId, tracks])

  useEffect(() => {
    try {
      if (currentTrackId) localStorage.setItem(CURRENT_TRACK_STORAGE_KEY, currentTrackId)
      else localStorage.removeItem(CURRENT_TRACK_STORAGE_KEY)
    } catch {
      // Track persistence is best-effort so playback keeps working without storage access.
    }
  }, [currentTrackId])

  useEffect(() => {
    try {
      localStorage.setItem(REPEAT_MODE_STORAGE_KEY, repeat)
    } catch {
      // Repeat mode is best-effort so playback keeps working without storage access.
    }
  }, [repeat])

  useEffect(() => {
    try {
      if (shuffle) localStorage.setItem(SHUFFLE_STORAGE_KEY, '1')
      else localStorage.removeItem(SHUFFLE_STORAGE_KEY)
    } catch {
      // Shuffle mode is best-effort so playback keeps working without storage access.
    }
  }, [shuffle])

  const play = useCallback((id: string) => {
    const track = tracks.find(t => t.id === id) ?? null
    setCurrentTrack(track)
    setCurrentTrackId(id)
    setIsPlaying(true)
  }, [tracks])

  const pause = useCallback(() => setIsPlaying(false), [])

  const togglePlay = useCallback(() => setIsPlaying(p => !p), [])

  const stop = useCallback(() => {
    setIsPlaying(false)
    setCurrentTrack(null)
    setCurrentTrackId(null)
  }, [])

  const next = useCallback(() => {
    if (!currentTrackId || tracks.length === 0) return
    if (repeat === 'one') return // stay on same track (audio reset handled by Player)

    const idx = tracks.findIndex(t => t.id === currentTrackId)
    if (shuffle) {
      const others = tracks.filter(t => t.id !== currentTrackId)
      const pick = others[Math.floor(Math.random() * others.length)]
      if (pick) {
        setCurrentTrack(pick)
        setCurrentTrackId(pick.id)
      }
      return
    }
    if (idx === tracks.length - 1) {
      if (repeat === 'all') {
        setCurrentTrack(tracks[0])
        setCurrentTrackId(tracks[0].id)
      } else {
        setIsPlaying(false) // end of list, no repeat
      }
    } else {
      setCurrentTrack(tracks[idx + 1])
      setCurrentTrackId(tracks[idx + 1].id)
    }
  }, [currentTrackId, tracks, shuffle, repeat])

  const prev = useCallback(() => {
    if (!currentTrackId || tracks.length === 0) return
    const idx = tracks.findIndex(t => t.id === currentTrackId)
    if (idx > 0) {
      setCurrentTrack(tracks[idx - 1])
      setCurrentTrackId(tracks[idx - 1].id)
    }
  }, [currentTrackId, tracks])

  return {
    currentTrackId,
    currentTrack,
    isPlaying,
    shuffle,
    repeat,
    play,
    pause,
    togglePlay,
    next,
    prev,
    stop,
    setShuffle: setShuffleState,
    setRepeat: setRepeatState,
  }
}
