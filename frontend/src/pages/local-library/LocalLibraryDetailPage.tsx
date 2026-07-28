import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  ReadOutlined,
} from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Empty, Input, Modal, Popconfirm, Spin, Tag, Typography, message } from 'antd'
import {
  deleteLocalLibraryBook,
  fetchLocalLibraryBook,
  fetchLocalLibraryBookToc,
  getLocalLibraryCoverUrl,
  openLocalLibraryFolder,
  updateLocalLibraryBook,
} from '../../api'
import { trimWindowsFilePathToFolder } from '../../lib/windows-path'
import type { LocalLibraryDetailDTO, LocalLibraryTocChapterDTO } from '../../types'
import { formatDateDdMmYyyy } from '../../utils'
import './books.css'

const SOURCE_LABELS = {
  hako: 'Hako',
  epub: 'Import EPUB',
  pdf: 'Import PDF',
} as const

function formatNumber(value?: number) {
  return typeof value === 'number' ? value.toLocaleString('vi-VN') : 'N/A'
}

interface Props {
  bookId: string
  onBack: () => void
  onRead: () => void
  onDeleted?: () => void
}

export default function LocalLibraryDetailPage({ bookId, onBack, onRead, onDeleted }: Props) {
  const [book, setBook] = useState<LocalLibraryDetailDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [openingFolder, setOpeningFolder] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tocChapters, setTocChapters] = useState<LocalLibraryTocChapterDTO[]>([])
  const [tocLoading, setTocLoading] = useState(false)
  const [tocError, setTocError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null)
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [coverVersion, setCoverVersion] = useState(0)
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchLocalLibraryBook(bookId)
      .then(data => {
        if (!cancelled) setBook(data)
      })
      .catch(err => {
        if (cancelled) return
        const messageText = err instanceof Error ? err.message : 'Failed to fetch book'
        setError(messageText)
        if (messageText.toLowerCase().includes('not found')) {
          onBack()
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bookId])

  useEffect(() => {
    if (book?.driveOffline) {
      message.warning(
        `Google Drive của ${book.drive ?? 'tài khoản cold storage'} chưa được mount. `
        + 'Hãy mở Google Drive Desktop rồi tải lại trang để đọc sách này.',
      )
    }
  }, [book?.driveOffline, book?.drive])

  useEffect(() => {
    if (!book || book.format !== 'epub' || !book.canRead) {
      setTocChapters([])
      setTocError(null)
      setTocLoading(false)
      return
    }

    let cancelled = false
    setTocLoading(true)
    setTocError(null)

    fetchLocalLibraryBookToc(bookId)
      .then(data => {
        if (!cancelled) setTocChapters(data.chapters)
      })
      .catch(err => {
        if (!cancelled) {
          setTocChapters([])
          setTocError(err instanceof Error ? err.message : 'Failed to fetch table of contents')
        }
      })
      .finally(() => {
        if (!cancelled) setTocLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [book, bookId])

  useEffect(() => {
    return () => {
      if (editCoverPreview) URL.revokeObjectURL(editCoverPreview)
    }
  }, [editCoverPreview])

  function openEditModal() {
    if (!book || book.source === 'hako') return
    setEditTitle(book.title)
    setEditCoverFile(null)
    setEditCoverPreview(null)
    setEditOpen(true)
  }

  function closeEditModal() {
    if (savingEdit) return
    setEditOpen(false)
    setEditCoverFile(null)
    if (editCoverPreview) URL.revokeObjectURL(editCoverPreview)
    setEditCoverPreview(null)
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  function handleCoverPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
      message.error('Ảnh bìa phải là JPG, PNG hoặc WebP')
      event.target.value = ''
      return
    }

    if (editCoverPreview) URL.revokeObjectURL(editCoverPreview)
    setEditCoverFile(file)
    setEditCoverPreview(URL.createObjectURL(file))
  }

  async function handleSaveEdit() {
    if (!book || book.source === 'hako') return

    const nextTitle = editTitle.trim()
    if (!nextTitle) {
      message.error('Tên sách không được để trống')
      return
    }

    const titleChanged = nextTitle !== book.title
    if (!titleChanged && !editCoverFile) {
      message.info('Không có thay đổi nào')
      return
    }

    setSavingEdit(true)
    try {
      const updated = await updateLocalLibraryBook(book.id, {
        title: titleChanged ? nextTitle : undefined,
        coverFile: editCoverFile ?? undefined,
      })
      setBook(updated)
      if (editCoverFile) setCoverVersion(Date.now())
      message.success('Đã cập nhật sách')
      setEditOpen(false)
      setEditCoverFile(null)
      if (editCoverPreview) URL.revokeObjectURL(editCoverPreview)
      setEditCoverPreview(null)
      if (coverInputRef.current) coverInputRef.current.value = ''
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to update book')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!book || book.source === 'hako') return

    setDeleting(true)
    try {
      await deleteLocalLibraryBook(book.id)
      message.success('Đã xóa sách')
      onDeleted?.()
      onBack()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to delete book')
    } finally {
      setDeleting(false)
    }
  }

  async function handleOpenFolder() {
    if (!book?.filePath) return

    const folderPath = trimWindowsFilePathToFolder(book.filePath)
    if (!folderPath) {
      message.error('Không thể mở thư mục này')
      return
    }

    setOpeningFolder(true)
    try {
      await openLocalLibraryFolder(folderPath)
      message.success('Đã mở thư mục')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to open folder')
    } finally {
      setOpeningFolder(false)
    }
  }

  if (loading) {
    return (
      <section className="books-page book-detail-page" role="main">
        <div className="book-detail-inner">
          <div className="books-loading">
            <Spin size="large" />
          </div>
        </div>
      </section>
    )
  }

  if (error || !book) {
    return (
      <section className="books-page book-detail-page" role="main">
        <div className="book-detail-inner">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} className="book-detail-back">
            Back to library
          </Button>
          <Alert showIcon type="error" message="Book error" description={error ?? 'Book not found'} />
        </div>
      </section>
    )
  }

  const coverBaseUrl = getLocalLibraryCoverUrl(book)
  const coverUrl = coverBaseUrl
    ? (coverVersion ? `${coverBaseUrl}?v=${coverVersion}` : coverBaseUrl)
    : null
  const lengthLabel = book.format === 'pdf' ? 'Số trang' : 'Số từ'
  const lengthValue = book.format === 'pdf' ? book.pageCount : book.charCount
  const canEdit = book.source !== 'hako'
  const currentCoverPreview = editCoverPreview
    ?? (coverUrl ?? null)

  return (
    <section className="books-page book-detail-page" role="main">
      <div className="book-detail-inner">
        <div className="book-detail-topbar">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} className="book-detail-back">
            Back to library
          </Button>
          <div className="book-detail-topbar-actions">
            {canEdit ? (
              <>
                <Button icon={<EditOutlined />} onClick={openEditModal} disabled={deleting}>
                  Sửa
                </Button>
                <Popconfirm
                  title="Bạn có chắc muốn xóa không?"
                  description={`Sách "${book.title}" sẽ bị xóa khỏi thư viện.`}
                  okText="Đồng ý"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true, loading: deleting }}
                  onConfirm={handleDelete}
                >
                  <Button danger icon={<DeleteOutlined />} loading={deleting}>
                    Xóa
                  </Button>
                </Popconfirm>
              </>
            ) : null}
            {book.canRead ? (
              <Button type="primary" icon={<ReadOutlined />} onClick={onRead} disabled={deleting}>
                Đọc sách
              </Button>
            ) : null}
          </div>
        </div>

        {book.driveOffline ? (
          <Alert
            showIcon
            type="warning"
            className="book-detail-drive-alert"
            message="Google Drive chưa được mount"
            description={`Sách này nằm trên Google Drive của ${book.drive ?? 'tài khoản cold storage'}. Hãy mở Google Drive Desktop rồi tải lại trang.`}
          />
        ) : null}

        <div className="book-detail-layout">
          <Card className="book-detail-cover-card" bordered={false}>
            <div className="book-detail-cover-wrap">
              {coverUrl ? (
                <img className="book-detail-cover" src={coverUrl} alt={book.title} />
              ) : (
                <div className="book-card-cover-fallback book-detail-cover-fallback">
                  <span className="book-card-cover-fallback-title">No cover</span>
                  <span className="book-card-cover-fallback-format">{book.format.toUpperCase()}</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="book-detail-info-card" bordered={false}>
            <div className="book-detail-tags">
              <Tag color="blue">{book.format.toUpperCase()}</Tag>
              <Tag>{SOURCE_LABELS[book.source]}</Tag>
            </div>

            <Typography.Title level={2} className="book-detail-title">
              {book.title}
            </Typography.Title>

            <Descriptions column={1} size="small" className="book-detail-meta">
              <Descriptions.Item label="Key">
                {book.key}
              </Descriptions.Item>
              {book.source === 'hako' ? (
                <Descriptions.Item label="Hako ID">
                  {formatNumber(book.numericId)}
                </Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Size (KB)">
                {formatNumber(book.sizeKb)}
              </Descriptions.Item>
              <Descriptions.Item label={lengthLabel}>
                {formatNumber(lengthValue)}
              </Descriptions.Item>
              <Descriptions.Item label="Last update">
                {book.lastUpdateAt ? formatDateDdMmYyyy(book.lastUpdateAt) : 'N/A'}
              </Descriptions.Item>
              {book.pdfVersion ? (
                <Descriptions.Item label="PDF version">
                  {book.pdfVersion}
                </Descriptions.Item>
              ) : null}
              {book.filePath ? (
                <Descriptions.Item label="Path">
                  <div className="book-detail-epub-actions">
                    <Typography.Text type="secondary" className="book-detail-epub-path" copyable>
                      {book.filePath}
                    </Typography.Text>
                    <Button
                      size="small"
                      icon={<FolderOpenOutlined />}
                      loading={openingFolder}
                      onClick={handleOpenFolder}
                      className="book-detail-open-folder-btn"
                    >
                      Mở thư mục
                    </Button>
                  </div>
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          </Card>
        </div>

        {book.format === 'epub' && book.canRead ? (
          <Card className="book-detail-toc-card" bordered={false} title="Mục lục">
            {tocLoading ? (
              <div className="book-detail-toc-loading">
                <Spin size="small" />
                <Typography.Text type="secondary">Đang tải mục lục...</Typography.Text>
              </div>
            ) : null}

            {tocError ? (
              <Alert showIcon type="warning" message={tocError} />
            ) : null}

            {!tocLoading && !tocError && tocChapters.length > 0 ? (
              <>
                <Typography.Text type="secondary" className="book-detail-toc-count">
                  {tocChapters.length.toLocaleString('vi-VN')} chương
                </Typography.Text>
                <ol className="book-detail-toc-list">
                  {tocChapters.map(chapter => (
                    <li key={chapter.slug} className="book-detail-toc-item">
                      <span className="book-detail-toc-title">{chapter.title}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}

            {!tocLoading && !tocError && tocChapters.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có mục lục" />
            ) : null}
          </Card>
        ) : null}
      </div>

      <Modal
        title="Sửa sách"
        open={editOpen}
        onCancel={closeEditModal}
        onOk={handleSaveEdit}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={savingEdit}
        destroyOnClose
      >
        <div className="book-detail-edit-form">
          <label className="book-detail-edit-label" htmlFor="book-edit-title">
            Tên sách
          </label>
          <Input
            id="book-edit-title"
            value={editTitle}
            onChange={event => setEditTitle(event.target.value)}
            placeholder="Nhập tên sách"
            maxLength={300}
            disabled={savingEdit}
          />

          <div className="book-detail-edit-cover-block">
            <span className="book-detail-edit-label">Ảnh bìa</span>
            <div className="book-detail-edit-cover-row">
              <div className="book-detail-edit-cover-preview">
                {currentCoverPreview ? (
                  <img src={currentCoverPreview} alt="Cover preview" />
                ) : (
                  <span>Chưa có ảnh</span>
                )}
              </div>
              <div className="book-detail-edit-cover-actions">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  hidden
                  onChange={handleCoverPick}
                />
                <Button
                  onClick={() => coverInputRef.current?.click()}
                  disabled={savingEdit}
                >
                  Chọn ảnh
                </Button>
                {editCoverFile ? (
                  <Typography.Text type="secondary" className="book-detail-edit-cover-name">
                    {editCoverFile.name}
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary">
                    JPG, PNG hoặc WebP
                  </Typography.Text>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </section>
  )
}
