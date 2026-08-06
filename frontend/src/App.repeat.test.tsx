import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  useLibrary: vi.fn(),
  usePlayer: vi.fn(),
}))

vi.mock('./hooks/useLibrary', () => ({
  useLibrary: mocks.useLibrary,
}))

vi.mock('./hooks/usePlayer', () => ({
  usePlayer: mocks.usePlayer,
}))

import App from './App'
import type { TrackDTO } from './types'

const track: TrackDTO = {
  id: 't1',
  filename: 'Track One',
  dateModified: '2025-01-01T00:00:00.000Z',
  duration: 180,
  format: 'mp3',
  hasCover: false,
}

describe('App repeat-one playback', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('app-active-tab', 'dashboard')
    vi.stubGlobal('fetch', vi.fn())
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    mocks.useLibrary.mockReturnValue({
      tracks: [track],
      isEmpty: false,
      loading: false,
      error: null,
      search: '',
      setSearch: vi.fn(),
      sortField: 'dateModified',
      setSortField: vi.fn(),
      sortOrder: 'desc',
      setSortOrder: vi.fn(),
      rescan: vi.fn(),
      upsertTrack: vi.fn(),
      removeTrack: vi.fn(),
    })
  })

  it('replays the same song when repeat mode is one', async () => {
    const next = vi.fn()
    const playSpy = vi.mocked(HTMLMediaElement.prototype.play)

    mocks.usePlayer.mockReturnValue({
      currentTrackId: track.id,
      currentTrack: track,
      isPlaying: true,
      shuffle: false,
      repeat: 'one',
      play: vi.fn(),
      pause: vi.fn(),
      togglePlay: vi.fn(),
      next,
      prev: vi.fn(),
      stop: vi.fn(),
      setShuffle: vi.fn(),
      setRepeat: vi.fn(),
    })

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    const audio = container.querySelector('audio') as HTMLAudioElement
    audio.currentTime = 42
    const callsBeforeEnded = playSpy.mock.calls.length

    fireEvent(audio, new Event('ended'))

    expect(next).not.toHaveBeenCalled()
    expect(playSpy.mock.calls.length).toBe(callsBeforeEnded + 1)
    expect(audio.currentTime).toBe(0)
  })
})
