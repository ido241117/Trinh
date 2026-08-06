import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FilterOutlined,
  PlusOutlined,
  ReadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  Modal,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  clearLocalLibraryLastRead,
  deleteLocalLibraryBook,
  getLocalLibraryFileUrl,
  importLocalLibraryBook,
} from '../../api'
import { useLocalLibrary } from '../../hooks/useLocalLibrary'
import { localLibraryBookPath, localLibraryReadPath } from '../../routes/paths'
import type { LocalLibraryListItemDTO, LocalLibrarySort, LocalLibrarySourceFilter } from '../../types'
import LocalLibraryCard from './LocalLibraryCard'
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

type ContextMenuState = {
  book: LocalLibraryListItemDTO
  x: number
  y: number
}

function getScrollPercent(element: HTMLElement) {
  const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
  if (maxScroll <= 0) return 0
  return Math.max(0, Math.min(1, element.scrollTop / maxScroll))
}

function applyScrollPercent(element: HTMLElement, percent: number) {
  const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
  element.scrollTop = maxScroll * Math.max(0, Math.min(1, percent))
}

export default function LocalLibraryPage() {
  const navigate = useNavigate()
  const pageRef = useRef<HTMLElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const pendingScrollPercentRef = useRef<number | null>(null)
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
    softRefresh,
    removeBook,
  } = useLocalLibrary()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  function closeContextMenu() {
    setContextMenu(null)
  }

  function handleCardContextMenu(event: React.MouseEvent, book: LocalLibraryListItemDTO) {
    event.preventDefault()
    event.stopPropagation()
    const padding = 8
    const menuWidth = 180
    const menuHeight = 184
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - padding)
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - padding)
    setContextMenu({ book, x: Math.max(padding, x), y: Math.max(padding, y) })
  }

  useEffect(() => {
    if (!contextMenu) return

    function onPointerDown(event: MouseEvent) {
      if (contextMenuRef.current?.contains(event.target as Node)) return
      closeContextMenu()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeContextMenu()
    }

    function onScrollOrResize() {
      closeContextMenu()
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onScrollOrResize)
    pageRef.current?.addEventListener('scroll', onScrollOrResize, { passive: true })

    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onScrollOrResize)
      pageRef.current?.removeEventListener('scroll', onScrollOrResize)
    }
  }, [contextMenu])

  useLayoutEffect(() => {
    const percent = pendingScrollPercentRef.current
    if (percent === null) return
    const page = pageRef.current
    if (!page || loading) return
    applyScrollPercent(page, percent)
  }, [books, loading])

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

  function handleDownload(book: LocalLibraryListItemDTO) {
    const link = document.createElement('a')
    link.href = getLocalLibraryFileUrl(book.id, 'full', { download: true })
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function confirmDelete(book: LocalLibraryListItemDTO) {
    if (book.source === 'hako') {
      message.warning('Không thể xóa sách Hako từ đây')
      return
    }

    Modal.confirm({
      title: 'Bạn có chắc muốn xóa không?',
      content: `Sách "${book.title}" sẽ bị xóa khỏi thư viện.`,
      okText: 'Đồng ý',
      cancelText: 'Hủy',
      okButtonProps: { danger: true, loading: deleting },
      onOk: async () => {
        const page = pageRef.current
        if (page) {
          pendingScrollPercentRef.current = getScrollPercent(page)
        }

        setDeleting(true)
        try {
          await deleteLocalLibraryBook(book.id)
          message.success('Đã xóa sách')
          removeBook(book.id)
          await softRefresh()
          const percent = pendingScrollPercentRef.current
          const scroller = pageRef.current
          if (percent !== null && scroller) {
            applyScrollPercent(scroller, percent)
            requestAnimationFrame(() => {
              if (pageRef.current) applyScrollPercent(pageRef.current, percent)
              pendingScrollPercentRef.current = null
            })
          } else {
            pendingScrollPercentRef.current = null
          }
        } catch (err) {
          pendingScrollPercentRef.current = null
          message.error(err instanceof Error ? err.message : 'Failed to delete book')
          throw err
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  function runContextAction(action: 'detail' | 'delete' | 'download' | 'read') {
    if (!contextMenu) return
    const { book } = contextMenu
    closeContextMenu()

    if (action === 'detail') {
      navigate(localLibraryBookPath(book.id))
      return
    }
    if (action === 'read') {
      navigate(localLibraryReadPath(book.id))
      return
    }
    if (action === 'download') {
      handleDownload(book)
      return
    }
    confirmDelete(book)
  }

  const contextBook = contextMenu?.book
  const canDelete = Boolean(contextBook && contextBook.source !== 'hako')

  return (
    <section ref={pageRef} className="books-page local-library-page" role="main">
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
                onClick={id => navigate(localLibraryBookPath(id))}
                onClearLastRead={handleClearLastRead}
                onContextMenu={handleCardContextMenu}
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

      {contextMenu && contextBook ? (
        <div
          ref={contextMenuRef}
          className="local-library-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button
            type="button"
            className="local-library-context-menu-item"
            role="menuitem"
            onClick={() => runContextAction('detail')}
          >
            <EyeOutlined className="local-library-context-menu-icon" />
            <span>Chi tiết</span>
          </button>
          <button
            type="button"
            className="local-library-context-menu-item"
            role="menuitem"
            disabled={!canDelete || deleting}
            onClick={() => runContextAction('delete')}
          >
            <DeleteOutlined className="local-library-context-menu-icon" />
            <span>Xóa</span>
          </button>
          <button
            type="button"
            className="local-library-context-menu-item"
            role="menuitem"
            onClick={() => runContextAction('download')}
          >
            <DownloadOutlined className="local-library-context-menu-icon" />
            <span>Tải</span>
          </button>
          <button
            type="button"
            className="local-library-context-menu-item"
            role="menuitem"
            onClick={() => runContextAction('read')}
          >
            <ReadOutlined className="local-library-context-menu-icon" />
            <span>Đọc</span>
          </button>
        </div>
      ) : null}

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
