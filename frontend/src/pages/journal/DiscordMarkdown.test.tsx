import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiscordMarkdown } from './DiscordMarkdown'

describe('DiscordMarkdown', () => {
  it('renders Discord-style inline formatting', () => {
    render(
      <DiscordMarkdown content="**bold** *italic* ***both*** __under__ ~~gone~~ `const x = 1`" />,
    )

    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
    expect(screen.getByText('both').closest('strong')).toBeInTheDocument()
    expect(screen.getByText('both').closest('em')).toBeInTheDocument()
    expect(screen.getByText('under')).toHaveClass('journal-md-underline')
    expect(screen.getByText('gone').tagName).toBe('S')
    expect(screen.getByText('const x = 1').tagName).toBe('CODE')
  })

  it('renders headings, lists, quotes, and code blocks', () => {
    render(
      <DiscordMarkdown
        content={[
          '# Title',
          '- First',
          '- Second',
          '> Quote line',
          '```json',
          '{"ok": true}',
          '```',
        ].join('\n')}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('First').tagName).toBe('LI')
    expect(screen.getByText('Second').tagName).toBe('LI')
    expect(screen.getByText('Quote line').closest('blockquote')).toHaveClass('journal-md-quote')
    expect(screen.getByText('{"ok": true}').tagName).toBe('CODE')
  })

  it('does not format markdown markers inside code blocks', () => {
    render(
      <DiscordMarkdown
        content={[
          '```',
          '**not bold**',
          '```',
        ].join('\n')}
      />,
    )

    expect(screen.getByText('**not bold**').closest('strong')).not.toBeInTheDocument()
  })

  it('highlights search matches inside rendered markdown text', () => {
    render(<DiscordMarkdown content="Hello **Thế** giới thế" highlightTerm="thế" />)

    const matches = screen.getAllByText(/thế/i)
    expect(matches).toHaveLength(2)
    expect(matches[0]).toHaveClass('journal-search-highlight')
    expect(matches[1]).toHaveClass('journal-search-highlight')
    expect(matches[0].closest('strong')).toBeInTheDocument()
  })

  it('renders location button separately from paragraph text', () => {
    render(
      <DiscordMarkdown
        content={[
          'test',
          '[[location:10.797393,106.703063]]',
        ].join('\n')}
      />,
    )

    expect(screen.getByText('test')).toBeInTheDocument()
    expect(screen.queryByText('[[location:10.797393,106.703063]]')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /mở google maps/i })
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=10.797393,106.703063')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('renders YouTube card with clickable title link', () => {
    render(
      <DiscordMarkdown
        content={[
          '[[youtube:dQw4w9WgXcQ|Never%20Gonna%20Give%20You%20Up|https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ]]',
        ].join('\n')}
      />,
    )

    const link = screen.getByRole('link', { name: /never gonna give you up/i })
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })
})
