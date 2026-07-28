import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Player from './Player'
import type { TrackDTO } from '../../types'

const track: TrackDTO = {
  id: 'x1',
  filename: 'Cool Song',
  dateModified: '2025-01-01T00:00:00.000Z',
  duration: 195,
  format: 'mp3',
  hasCover: false,
}

const nextTrack: TrackDTO = {
  id: 'x2',
  filename: 'Next Song',
  dateModified: '2025-01-02T00:00:00.000Z',
  duration: 210,
  format: 'mp3',
  hasCover: false,
}

const baseProps = {
  currentTrack: track,
  isPlaying: true,
  shuffle: false,
  repeat: 'off' as const,
  onTogglePlay: vi.fn(),
  onStop: vi.fn(),
  onNext: vi.fn(),
  onPrev: vi.fn(),
  onSetShuffle: vi.fn(),
  onSetRepeat: vi.fn(),
  audioRef: { current: null } as React.RefObject<HTMLAudioElement>,
  progress: 0,
  duration: 195,
  onSeek: vi.fn(),
  volume: 1,
  onVolumeChange: vi.fn(),
}

function openPlayerPanel() {
  fireEvent.click(screen.getByLabelText('Music player'))
}

describe('Player', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders null when no current track', () => {
    const { container } = render(<Player {...baseProps} currentTrack={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows floating trigger when a track is loaded', () => {
    render(<Player {...baseProps} />)
    expect(screen.getByLabelText('Music player')).toBeInTheDocument()
  })

  it('shows track filename in the panel', () => {
    render(<Player {...baseProps} />)
    openPlayerPanel()
    expect(screen.getByText('Cool Song')).toBeInTheDocument()
  })

  it('shows play icon when paused', () => {
    render(<Player {...baseProps} isPlaying={false} />)
    openPlayerPanel()
    expect(screen.getByTitle('Play')).toBeInTheDocument()
  })

  it('shows pause icon when playing', () => {
    render(<Player {...baseProps} isPlaying={true} />)
    openPlayerPanel()
    expect(screen.getByTitle('Pause')).toBeInTheDocument()
  })

  it('calls onTogglePlay on play/pause click', () => {
    const onTogglePlay = vi.fn()
    render(<Player {...baseProps} onTogglePlay={onTogglePlay} />)
    openPlayerPanel()
    fireEvent.click(screen.getByTitle('Pause'))
    expect(onTogglePlay).toHaveBeenCalledTimes(1)
  })

  it('calls onNext and onPrev', () => {
    const onNext = vi.fn()
    const onPrev = vi.fn()
    render(<Player {...baseProps} onNext={onNext} onPrev={onPrev} />)
    openPlayerPanel()
    fireEvent.click(screen.getByTitle('Next'))
    fireEvent.click(screen.getByTitle('Previous'))
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).toHaveBeenCalledTimes(1)
  })

  it('calls onStop when stop is clicked', () => {
    const onStop = vi.fn()
    render(<Player {...baseProps} onStop={onStop} />)
    openPlayerPanel()
    fireEvent.click(screen.getByTitle('Stop'))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('keeps the panel open when the track changes', () => {
    const { rerender } = render(<Player {...baseProps} />)
    openPlayerPanel()

    rerender(<Player {...baseProps} currentTrack={nextTrack} />)

    expect(screen.getByText('Next Song')).toBeInTheDocument()
    expect(screen.getByLabelText('Music player')).toHaveAttribute('aria-expanded', 'true')
  })

  it('highlights shuffle button when active', () => {
    render(<Player {...baseProps} shuffle={true} />)
    openPlayerPanel()
    expect(screen.getByTitle('Shuffle').className).toContain('is-active')
  })

  it('shows repeat state', () => {
    render(<Player {...baseProps} repeat="one" />)
    openPlayerPanel()
    expect(screen.getByTitle('Repeat').textContent).toContain('1')
  })
})
