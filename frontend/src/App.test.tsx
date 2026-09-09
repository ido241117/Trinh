import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

const PAGE_LOAD_TIMEOUT_MS = 15_000

function renderApp(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  await Promise.all([
    import('./pages/music'),
    import('./pages/watchlist'),
  ])
})

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  }))
})

describe('App', () => {
  it('renders without crashing', async () => {
    renderApp()
    expect(screen.getByTitle('Music')).toBeInTheDocument()
    await screen.findByRole('searchbox', {}, { timeout: PAGE_LOAD_TIMEOUT_MS })
  })

  it('renders sidebar with Music, Watchlist, and Offline Library nav items', async () => {
    renderApp()
    expect(screen.getByTitle('Music')).toBeInTheDocument()
    expect(screen.getByTitle('Watchlist')).toBeInTheDocument()
    expect(screen.getByTitle('Offline Library')).toBeInTheDocument()
    expect(screen.queryByTitle('Download')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Settings')).not.toBeInTheDocument()
    await screen.findByRole('searchbox', {}, { timeout: PAGE_LOAD_TIMEOUT_MS })
  })

  it('shows Music page by default', async () => {
    renderApp()
    expect(await screen.findByRole('searchbox', {}, { timeout: PAGE_LOAD_TIMEOUT_MS })).toBeInTheDocument()
  })

  it('switches to Watchlist page when clicking Watchlist tab', async () => {
    renderApp()
    fireEvent.click(screen.getByTitle('Watchlist'))
    expect(await screen.findByText(/LEGACY PLAYLIST/i, {}, { timeout: PAGE_LOAD_TIMEOUT_MS })).toBeInTheDocument()
  })

  it('floating player is hidden when no track is loaded', async () => {
    renderApp()
    expect(screen.queryByLabelText('Music player')).toBeNull()
    await screen.findByRole('searchbox', {}, { timeout: PAGE_LOAD_TIMEOUT_MS })
    expect(screen.queryByLabelText('Music player')).toBeNull()
  })
})
