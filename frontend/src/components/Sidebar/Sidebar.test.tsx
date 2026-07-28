import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Sidebar from './Sidebar'

describe('Sidebar', () => {
  it('renders nav items including Offline Library', () => {
    render(<Sidebar activeTab="music" onTabChange={vi.fn()} />)
    expect(screen.getByTitle('Music')).toBeInTheDocument()
    expect(screen.getByTitle('Watchlist')).toBeInTheDocument()
    expect(screen.getByTitle('Offline Library')).toBeInTheDocument()
    expect(screen.queryByTitle('Download')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Settings')).not.toBeInTheDocument()
  })

  it('highlights the active tab', () => {
    render(<Sidebar activeTab="watchlist" onTabChange={vi.fn()} />)
    expect(screen.getByTitle('Watchlist').className).toContain('is-active')
    expect(screen.getByTitle('Music').className).not.toContain('is-active')
  })

  it('calls onTabChange with correct tab when clicking Music', () => {
    const onTabChange = vi.fn()
    render(<Sidebar activeTab="watchlist" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByTitle('Music'))
    expect(onTabChange).toHaveBeenCalledWith('music')
  })

  it('calls onTabChange with "watchlist" when clicking Watchlist', () => {
    const onTabChange = vi.fn()
    render(<Sidebar activeTab="music" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByTitle('Watchlist'))
    expect(onTabChange).toHaveBeenCalledWith('watchlist')
  })

  it('Watchlist button has active style when activeTab === "watchlist"', () => {
    render(<Sidebar activeTab="watchlist" onTabChange={vi.fn()} />)
    expect(screen.getByTitle('Watchlist').className).toContain('is-active')
    expect(screen.getByTitle('Music').className).not.toContain('is-active')
  })

  it('does not render app shortcuts button', () => {
    render(<Sidebar activeTab="music" onTabChange={vi.fn()} />)
    expect(screen.queryByTitle('App shortcuts')).not.toBeInTheDocument()
  })
})
