import { useEffect, useRef, useState } from 'react'
import type { TrackDTO } from '../../types'
import type { RepeatMode } from '../../hooks/usePlayer'
import { formatDuration } from '../../utils'
import './Player.css'

interface Props {
  currentTrack: TrackDTO | null
  isPlaying: boolean
  shuffle: boolean
  repeat: RepeatMode
  onTogglePlay: () => void
  onStop: () => void
  onNext: () => void
  onPrev: () => void
  onSetShuffle: (v: boolean) => void
  onSetRepeat: (v: RepeatMode) => void
  audioRef: React.RefObject<HTMLAudioElement>
  progress: number
  duration: number
  onSeek: (value: number) => void
  volume: number
  onVolumeChange: (value: number) => void
}

export default function Player({
  currentTrack, isPlaying, shuffle, repeat,
  onTogglePlay, onStop, onNext, onPrev, onSetShuffle, onSetRepeat,
  audioRef, progress, duration, onSeek, volume, onVolumeChange,
}: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!currentTrack) setOpen(false)
  }, [currentTrack])

  if (!currentTrack) return null

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value)
    onSeek(t)
  }

  function handleVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value)
    onVolumeChange(v)
  }

  function cycleRepeat() {
    const modes: RepeatMode[] = ['off', 'one', 'all']
    const next = modes[(modes.indexOf(repeat) + 1) % modes.length]
    onSetRepeat(next)
  }

  function handleStop() {
    setOpen(false)
    onStop()
  }

  const repeatLabel = repeat === 'one' ? '1' : repeat === 'all' ? '∞' : ''

  return (
    <div className="floating-player" data-player-floating>
      {open && (
        <>
          <button
            type="button"
            className="floating-player-backdrop"
            aria-label="Close music player"
            onClick={() => setOpen(false)}
          />
          <section className="floating-player-panel" aria-label="Now playing">
            <div className="floating-player-header">
              <img
                src={`/api/cover/${currentTrack.id}`}
                alt=""
                className="floating-player-cover"
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
              <div className="floating-player-meta">
                <div className="floating-player-title">{currentTrack.filename}</div>
                {currentTrack.artist && (
                  <div className="floating-player-artist">{currentTrack.artist}</div>
                )}
              </div>
              <button type="button" className="floating-player-stop" title="Stop" onClick={handleStop}>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.59 7.1 5.7A1 1 0 0 0 5.7 7.1L10.59 12l-4.9 4.9a1 1 0 1 0 1.4 1.4L12 13.41l4.9 4.9a1 1 0 0 0 1.4-1.4L13.41 12l4.9-4.9a1 1 0 0 0 0-1.4z" />
                </svg>
              </button>
            </div>

            <div className="floating-player-controls">
              <button
                type="button"
                title="Shuffle"
                className={`floating-player-control ${shuffle ? 'is-active' : ''}`}
                onClick={() => onSetShuffle(!shuffle)}
              >
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16 3h5v5l-1.5-1.5-4.5 4.5-1.4-1.4 4.5-4.5L16 3zm-8 0L3 3v5l1.5-1.5 4.5 4.5 1.4-1.4L5.9 6.5 8 4.5 8 3zm-5 13l1.5 1.5 4.5-4.5 1.4 1.4-4.5 4.5L9 21H4v-5zm13 3l-1.5-1.5-4.5-4.5 1.4-1.4 4.5 4.5L21 16v5h-5l1.5-1.5z" />
                </svg>
              </button>

              <button type="button" title="Previous" className="floating-player-control" onClick={onPrev}>
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                </svg>
              </button>

              <button type="button" title={isPlaying ? 'Pause' : 'Play'} className="floating-player-play" onClick={onTogglePlay}>
                {isPlaying
                  ? <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6zm8-14v14h4V5z" /></svg>
                  : <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
              </button>

              <button type="button" title="Next" className="floating-player-control" onClick={onNext}>
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 18l8.5-6L6 6v12zm2-8.14 5.12 3.64-5.12 3.64V9.86zM16 6h2v12h-2z" />
                </svg>
              </button>

              <span className="floating-player-repeat-wrap">
                <button
                  type="button"
                  title="Repeat"
                  className={`floating-player-control ${repeat !== 'off' ? 'is-active' : ''}`}
                  onClick={cycleRepeat}
                >
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
                  </svg>
                  {repeatLabel && <span className="floating-player-repeat-label">{repeatLabel}</span>}
                </button>
              </span>
            </div>

            <div className="floating-player-progress">
              <span className="floating-player-time">{formatDuration(progress)}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={1}
                value={progress}
                onChange={handleSeek}
                aria-label="Progress"
                className="floating-player-seek"
              />
              <span className="floating-player-time is-end">{formatDuration(duration)}</span>
            </div>

            <div className="floating-player-volume">
              <svg className="floating-player-volume-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={handleVolume}
                aria-label="Volume"
                className="floating-player-volume-slider"
              />
            </div>
          </section>
        </>
      )}

      <div className="floating-player-trigger-wrap">
        <button
          type="button"
          className={`floating-player-trigger ${open ? 'is-open' : ''}`}
          aria-label="Music player"
          title="Music controls"
          aria-expanded={open}
          onClick={() => setOpen(prev => !prev)}
        >
          {currentTrack.hasCover ? (
            <img
              src={`/api/cover/${currentTrack.id}`}
              alt=""
              className="floating-player-trigger-cover"
              onError={e => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <svg className="floating-player-trigger-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
            </svg>
          )}
        </button>
        {isPlaying && <span className="floating-player-trigger-badge" aria-hidden="true" />}
      </div>

    </div>
  )
}
