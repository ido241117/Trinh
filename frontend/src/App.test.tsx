import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

function renderApp(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  )
}

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
    await waitFor(() => expect(screen.getByRole('main')).toBeInTheDocument())
  })

  it('renders sidebar with Music, Watchlist, and Offline Library nav items', async () => {
    renderApp()
    expect(screen.getByTitle('Music')).toBeInTheDocument()
    expect(screen.getByTitle('Watchlist')).toBeInTheDocument()
    expect(screen.getByTitle('Offline Library')).toBeInTheDocument()
    expect(screen.queryByTitle('Download')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Settings')).not.toBeInTheDocument()
  })

  it('shows Music page by default', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByRole('main')).toBeInTheDocument())
    // Music page has search input
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('switches to Watchlist page when clicking Watchlist tab', async () => {
    renderApp()
    fireEvent.click(screen.getByTitle('Watchlist'))
    await waitFor(() =>
      expect(screen.getByText(/LEGACY PLAYLIST/i)).toBeInTheDocument()
    )
  })

  it('floating player is hidden when no track is loaded', async () => {
    renderApp()
    expect(screen.queryByLabelText('Music player')).toBeNull()
  })
})
