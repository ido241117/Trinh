import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  FilterOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import { clearLocalLibraryLastRead, importLocalLibraryBook } from '../../api'
import { useLocalLibrary } from '../../hooks/useLocalLibrary'
import type { LocalLibrarySort, LocalLibrarySourceFilter } from '../../types'
import LocalLibraryCard from './LocalLibraryCard'
import LocalLibraryDetailPage from './LocalLibraryDetailPage'
import LocalLibraryReadPage from './LocalLibraryReadPage'
import './books.css'
import './local-library.css'

const SORT_GROUPS: {
  key: string
  label: string
  asc: LocalLibrarySort
  desc: LocalLibrarySort
}[] = [
  { key: 'hako_id', label: 'Hako ID', asc: 'hako_id_asc', desc: 'hako_id_desc' },
  { key: 'title', label: 'Name', asc: 'title_asc', desc: 'title_desc' },
  { key: 'last_read', label: 'Last read', asc: 'last_read_asc', desc: 'last_read_desc' },
  { key: 'last_update', label: 'Last update', asc: 'last_update_asc', desc: 'last_update_desc' },
  { key: 'length', label: 'Length', asc: 'length_asc', desc: 'length_desc' },
  { key: 'size', label: 'Size (KB)', asc: 'size_asc', desc: 'size_desc' },
]

const SOURCE_OPTIONS: { value: LocalLibrarySourceFilter; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'hako', label: 'Hako' },
  { value: 'epub', label: 'Import EPUB' },
  { value: 'pdf', label: 'Import PDF' },
]

export default function LocalLibraryPage({
  initialBookId = null,
  onInitialBookIdConsumed,
}: {
  initialBookId?: string | null
  onInitialBookIdConsumed?: () => void
}) {
  const {
    books,
    total,
    search,
    setSearch,
    sort,
    setSort,
    source,
    setSource,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
  } = useLocalLibrary()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedBookId, setSelectedBookId] = useState<string | null>(initialBookId)
  const [readingBookId, setReadingBookId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!initialBookId) return
    setSelectedBookId(initialBookId)
    onInitialBookIdConsumed?.()
  }, [initialBookId, onInitialBookIdConsumed])

  function setSortGroup(group: (typeof SORT_GROUPS)[number]) {
    setSort(current => (current === group.asc ? group.desc : group.asc))
  }

  const hasActiveFilters = Boolean(
    search.trim()
    || sort !== 'size_desc'
    || source !== 'all',
  )

  function clearAdvancedFilters() {
    setSearch('')
    setSort('size_desc')
    setSource('all')
  }

  async function handleClearLastRead(bookId: string) {
    try {
      await clearLocalLibraryLastRead(bookId)
      message.success('Đã xóa lịch sử đọc')
      refresh()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to clear last read')
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) {
      message.error('No file selected')
      input.value = ''
      return
    }

    setImporting(true)
    try {
      const book = await importLocalLibraryBook(file)
      message.success(`Đã thêm "${book.title}" vào thư viện offline`)
      refresh()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to import book')
    } finally {
      setImporting(false)
      input.value = ''
    }
  }

  if (readingBookId) {
    return (
      <LocalLibraryReadPage
        bookId={readingBookId}
        onBack={() => setReadingBookId(null)}
      />
    )
  }

  if (selectedBookId) {
    return (
      <LocalLibraryDetailPage
        bookId={selectedBookId}
        onBack={() => setSelectedBookId(null)}
        onRead={() => setReadingBookId(selectedBookId)}
        onDeleted={() => {
          setSelectedBookId(null)
          refresh()
        }}
      />
    )
  }

  return (
    <section className="books-page local-library-page" role="main">
      <header className="books-header">
        <div>
          <Typography.Title level={3} className="books-title">
            OFFLINE LIBRARY
          </Typography.Title>
          <Typography.Text type="secondary">
            {loading ? 'Loading…' : `${total.toLocaleString('vi-VN')} books`}
          </Typography.Text>
        </div>
        <div className="books-header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub,.pdf,application/epub+zip,application/pdf"
            hidden
            onChange={handleImportFile}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            Thêm sách
          </Button>
          <Button
            icon={<FilterOutlined />}
            onClick={() => setFiltersOpen(true)}
          >
            Bộ lọc & Sắp xếp nâng cao
          </Button>
        </div>
      </header>

      {error ? (
        <Alert
          showIcon
          type="error"
          message="Library error"
          description={error}
          className="books-alert"
        />
      ) : null}

      {loading ? (
        <div className="books-loading">
          <Spin size="large" />
        </div>
      ) : books.length === 0 ? (
        <Empty description="No books found" />
      ) : (
        <>
          <div className="books-grid">
            {books.map(book => (
              <LocalLibraryCard
                key={book.id}
                book={book}
                onClick={setSelectedBookId}
                onClearLastRead={handleClearLastRead}
              />
            ))}
          </div>

          {hasMore ? (
            <div className="books-load-more">
              <Button loading={loadingMore} onClick={loadMore}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Bộ lọc & Sắp xếp nâng cao"
        width={720}
        destroyOnClose={false}
        footer={(
          <div className="books-filter-drawer-footer">
            <Button onClick={clearAdvancedFilters} disabled={!hasActiveFilters}>
              Xóa bộ lọc
            </Button>
            <Button type="primary" onClick={() => setFiltersOpen(false)}>
              Hoàn tất
            </Button>
          </div>
        )}
      >
        <div className="books-filter-panel">
          <section className="books-filter-section">
            <Typography.Text className="books-filter-label">Tìm kiếm</Typography.Text>
            <Input
              role="searchbox"
              prefix={<SearchOutlined />}
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search title, key, Hako id…"
              allowClear
              size="large"
            />
          </section>

          <section className="books-filter-section">
            <div className="books-filter-section-head">
              <Typography.Text className="books-filter-label">Sắp xếp</Typography.Text>
              <Typography.Text type="secondary">Bấm một lần để tăng dần, bấm lại để đảo chiều</Typography.Text>
            </div>
            <div className="books-chip-group">
              {SORT_GROUPS.map(group => {
                const isActive = sort === group.asc || sort === group.desc
                const isAsc = sort === group.asc

                return (
                  <Tag.CheckableTag
                    key={group.key}
                    checked={isActive}
                    onChange={() => setSortGroup(group)}
                    className="books-filter-chip-button"
                  >
                    <span className="books-sort-chip">
                      <span>{group.label}</span>
                      <span className="books-sort-chip-direction" aria-hidden="true">
                        {isActive ? (isAsc ? <ArrowUpOutlined /> : <ArrowDownOutlined />) : <ArrowUpOutlined />}
                      </span>
                    </span>
                  </Tag.CheckableTag>
                )
              })}
            </div>
          </section>

          <section className="books-filter-section">
            <div className="books-filter-section-head">
              <Typography.Text className="books-filter-label">Nguồn</Typography.Text>
              <Typography.Text type="secondary">Hako, Import EPUB hoặc Import PDF</Typography.Text>
            </div>
            <div className="books-chip-group">
              {SOURCE_OPTIONS.map(option => (
                <Tag.CheckableTag
                  key={option.value}
                  checked={source === option.value}
                  onChange={checked => {
                    if (checked) setSource(option.value)
                  }}
                  className="books-filter-chip-button"
                >
                  {option.label}
                </Tag.CheckableTag>
              ))}
            </div>
          </section>
        </div>
      </Drawer>
    </section>
  )
}
