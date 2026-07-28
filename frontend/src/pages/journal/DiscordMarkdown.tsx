import type { ReactNode } from 'react'
import { parseJournalLocationMarker } from './journalLocation'
import { parseJournalYoutubeMarker } from './journalYoutube'
import { JournalLocationBlock, JournalYoutubeBlock } from './JournalEmbedBlocks'

interface DiscordMarkdownProps {
  content: string
  highlightTerm?: string
}

interface ParseContext {
  highlightTerm: string
}

interface InlineMarker {
  marker: string
  render: (children: ReactNode[], key: string) => ReactNode
}

const inlineMarkers: InlineMarker[] = [
  {
    marker: '***',
    render: (children, key) => (
      <strong key={key}>
        <em>{children}</em>
      </strong>
    ),
  },
  {
    marker: '**',
    render: (children, key) => <strong key={key}>{children}</strong>,
  },
  {
    marker: '__',
    render: (children, key) => (
      <span key={key} className="journal-md-underline">
        {children}
      </span>
    ),
  },
  {
    marker: '~~',
    render: (children, key) => <s key={key}>{children}</s>,
  },
  {
    marker: '*',
    render: (children, key) => <em key={key}>{children}</em>,
  },
  {
    marker: '_',
    render: (children, key) => <em key={key}>{children}</em>,
  },
]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightPlainText(text: string, keyPrefix: string, term: string): ReactNode[] {
  const normalizedTerm = term.trim()
  if (!normalizedTerm) return [text]

  const pattern = new RegExp(`(${escapeRegExp(normalizedTerm)})`, 'gi')
  const parts = text.split(pattern)
  return parts
    .filter(part => part.length > 0)
    .map((part, index) => (
      part.toLocaleLowerCase('vi-VN') === normalizedTerm.toLocaleLowerCase('vi-VN') ? (
        <mark className="journal-search-highlight" key={`${keyPrefix}-hit${index}`}>
          {part}
        </mark>
      ) : part
    ))
}

function parseInlineText(text: string, keyPrefix: string, context: ParseContext): ReactNode[] {
  const nodes: ReactNode[] = []
  const codePattern = /`([^`\n]+)`/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = codePattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(...parseInlineMarkers(text.slice(cursor, match.index), 0, `${keyPrefix}-t${cursor}`, context))
    }
    nodes.push(
      <code className="journal-md-inline-code" key={`${keyPrefix}-code${match.index}`}>
        {match[1]}
      </code>,
    )
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) {
    nodes.push(...parseInlineMarkers(text.slice(cursor), 0, `${keyPrefix}-t${cursor}`, context))
  }

  return nodes
}

function parseInlineMarkers(text: string, markerIndex: number, keyPrefix: string, context: ParseContext): ReactNode[] {
  if (!text) return []
  const marker = inlineMarkers[markerIndex]
  if (!marker) return highlightPlainText(text, keyPrefix, context.highlightTerm)

  const start = text.indexOf(marker.marker)
  if (start === -1) return parseInlineMarkers(text, markerIndex + 1, keyPrefix, context)

  const innerStart = start + marker.marker.length
  const end = text.indexOf(marker.marker, innerStart)
  if (end === -1) return parseInlineMarkers(text, markerIndex + 1, keyPrefix, context)

  const before = text.slice(0, start)
  const inner = text.slice(innerStart, end)
  const after = text.slice(end + marker.marker.length)

  return [
    ...parseInlineMarkers(before, markerIndex, `${keyPrefix}-b`, context),
    marker.render(parseInlineMarkers(inner, markerIndex + 1, `${keyPrefix}-i`, context), `${keyPrefix}-m${start}`),
    ...parseInlineMarkers(after, markerIndex, `${keyPrefix}-a`, context),
  ]
}

function renderLineBreaks(lines: string[], keyPrefix: string, context: ParseContext): ReactNode[] {
  return lines.flatMap((line, index) => {
    const lineNodes = parseInlineText(line, `${keyPrefix}-line${index}`, context)
    return index === lines.length - 1 ? lineNodes : [...lineNodes, <br key={`${keyPrefix}-br${index}`} />]
  })
}

function isCodeFence(line: string) {
  return line.trimStart().startsWith('```')
}

function isHeading(line: string) {
  return /^(#{1,3})\s+\S/.test(line)
}

function isQuote(line: string) {
  return /^>>> ?/.test(line) || /^> ?/.test(line)
}

function getListMatch(line: string) {
  return /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line)
}

function isLocationLine(line: string) {
  return parseJournalLocationMarker(line) !== null
}

function isYoutubeLine(line: string) {
  return parseJournalYoutubeMarker(line) !== null
}

function isBlockStart(line: string) {
  return isCodeFence(line) || isHeading(line) || isQuote(line) || Boolean(getListMatch(line)) || isLocationLine(line) || isYoutubeLine(line)
}

export function DiscordMarkdown({ content, highlightTerm = '' }: DiscordMarkdownProps) {
  const context = { highlightTerm }
  const normalized = content.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    const location = parseJournalLocationMarker(line)
    if (location) {
      blocks.push(<JournalLocationBlock key={`block-${blocks.length}`} location={location} />)
      index += 1
      continue
    }

    const youtubeLink = parseJournalYoutubeMarker(line)
    if (youtubeLink) {
      blocks.push(<JournalYoutubeBlock key={`block-${blocks.length}`} link={youtubeLink} />)
      index += 1
      continue
    }

    if (isCodeFence(line)) {
      const language = line.trimStart().slice(3).trim()
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !isCodeFence(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(
        <pre className="journal-md-code-block" key={`block-${blocks.length}`}>
          <code className={language ? `language-${language}` : undefined}>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line)
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 2)
      const HeadingTag = `h${level}` as 'h1' | 'h2'
      blocks.push(
        <HeadingTag className="journal-md-heading" key={`block-${blocks.length}`}>
          {parseInlineText(headingMatch[2], `heading-${index}`, context)}
        </HeadingTag>,
      )
      index += 1
      continue
    }

    if (/^>>> ?/.test(line)) {
      const quoteLines = [line.replace(/^>>> ?/, ''), ...lines.slice(index + 1)]
      blocks.push(
        <blockquote className="journal-md-quote" key={`block-${blocks.length}`}>
          {renderLineBreaks(quoteLines, `quote-${index}`, context)}
        </blockquote>,
      )
      break
    }

    if (/^> ?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^> ?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^> ?/, ''))
        index += 1
      }
      blocks.push(
        <blockquote className="journal-md-quote" key={`block-${blocks.length}`}>
          {renderLineBreaks(quoteLines, `quote-${index}`, context)}
        </blockquote>,
      )
      continue
    }

    const listMatch = getListMatch(line)
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2])
      const ListTag = ordered ? 'ol' : 'ul'
      const listItems: ReactNode[] = []

      while (index < lines.length) {
        const currentMatch = getListMatch(lines[index])
        if (!currentMatch || /\d+\./.test(currentMatch[2]) !== ordered) break
        const indentLevel = Math.floor(currentMatch[1].replace(/\t/g, '  ').length / 2)
        listItems.push(
          <li
            className="journal-md-list-item"
            key={`item-${index}`}
            style={indentLevel > 0 ? { marginLeft: `${indentLevel * 18}px` } : undefined}
          >
            {parseInlineText(currentMatch[3], `list-${index}`, context)}
          </li>,
        )
        index += 1
      }

      blocks.push(
        <ListTag className="journal-md-list" key={`block-${blocks.length}`}>
          {listItems}
        </ListTag>,
      )
      continue
    }

    const paragraphLines = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraphLines.push(lines[index])
      index += 1
    }
    blocks.push(
      <p className="journal-md-paragraph" key={`block-${blocks.length}`}>
        {renderLineBreaks(paragraphLines, `paragraph-${index}`, context)}
      </p>,
    )
  }

  return <div className="journal-markdown">{blocks}</div>
}
