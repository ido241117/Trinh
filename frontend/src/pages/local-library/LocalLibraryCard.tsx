import type { LocalLibraryListItemDTO } from '../../types'
import { getLocalLibraryCoverUrl } from '../../api'
import { formatDateDdMmYyyy } from '../../utils'

function formatNumber(value?: number) {
  return typeof value === 'number' ? value.toLocaleString('vi-VN') : undefined
}

function HoverInfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="book-card-hover-row">
      <span className="book-card-hover-label">{label}</span>
      <span className="book-card-hover-value">{value || 'N/A'}</span>
    </div>
  )
}

const SOURCE_LABELS = {
  hako: 'Hako',
  epub: 'Import EPUB',
  pdf: 'Import PDF',
} as const

interface Props {
  book: LocalLibraryListItemDTO
  onClick: (id: string) => void
  onClearLastRead?: (bookId: string) => void | Promise<void>
  onContextMenu?: (event: React.MouseEvent, book: LocalLibraryListItemDTO) => void
}

export default function LocalLibraryCard({
  book,
  onClick,
  onClearLastRead,
  onContextMenu,
}: Props) {
  const coverUrl = getLocalLibraryCoverUrl(book)
  const lengthLabel = book.format === 'pdf' ? 'Số trang' : 'Số từ'
  const lengthValue = book.format === 'pdf' ? book.pageCount : book.charCount
  const hasLastRead = Boolean(book.lastReadAt)

  return (
    <article
      className="book-card"
      onContextMenu={event => {
        event.preventDefault()
        onContextMenu?.(event, book)
      }}
    >
      <button type="button" className="book-card-main" onClick={() => onClick(book.id)}>
        <div className="book-card-cover-wrap">
          {coverUrl ? (
            <img className="book-card-cover" src={coverUrl} alt={book.title} loading="lazy" />
          ) : (
            <div className="book-card-cover-fallback">
              <span className="book-card-cover-fallback-title">No cover</span>
              <span className="book-card-cover-fallback-format">{book.format.toUpperCase()}</span>
            </div>
          )}

          <div className="book-card-hover">
            {hasLastRead && onClearLastRead ? (
              <button
                type="button"
                className="book-card-clear-lastread book-card-clear-lastread--left"
                title="Xóa lịch sử đọc"
                onClick={e => {
                  e.stopPropagation()
                  void onClearLastRead(book.id)
                }}
              >
                ✕
              </button>
            ) : null}
            <HoverInfoRow label="Source" value={SOURCE_LABELS[book.source]} />
            {book.source === 'hako' ? (
              <HoverInfoRow label="DocLN URL" value={book.seriesUrl} />
            ) : null}
            <HoverInfoRow label="Key" value={book.key} />
            <HoverInfoRow label="ID" value={String(book.numericId)} />
            <HoverInfoRow
              label="Last update"
              value={book.lastUpdateAt ? formatDateDdMmYyyy(book.lastUpdateAt) : undefined}
            />
            <HoverInfoRow label={lengthLabel} value={formatNumber(lengthValue)} />
            <HoverInfoRow label="Size (KB)" value={formatNumber(book.sizeKb)} />
          </div>
        </div>

        <div className="book-card-body">
          <h3 className="book-card-title" title={book.title}>
            {book.title}
          </h3>
        </div>
      </button>
    </article>
  )
}
