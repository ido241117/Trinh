import { useEffect, useRef, useState } from 'react'
import { Button, Modal, Slider } from 'antd'
import {
  clearDashboardBackground,
  fetchDashboardSettings,
  updateDashboardBackground,
  fetchLocalLibrary,
  getLocalLibraryCoverUrl,
} from '../../api'
import { useAppTheme } from '../../context/AppThemeContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import {
  DASHBOARD_BACKGROUND_URLS,
  type DashboardBackgroundTheme,
  type DashboardSettingsDTO,
  type JournalMessageDTO,
  type LocalLibraryListItemDTO,
  type TrackDTO,
} from '../../types'
import { formatDuration } from '../../utils'
import { applyDashboardTheme } from './dashboardTheme'
import {
  fetchDashboardJournalMessages,
  formatJournalDateTime,
  formatJournalDayHcm,
  getJournalMessageText,
} from './dashboardJournal'
import './dashboard.css'

interface BackgroundSlot {
  theme: DashboardBackgroundTheme
  label: string
  hint?: string
  previewUrl: string | null
}

function BackgroundSettingsModal({
  open,
  onClose,
  onUpload,
  onClear,
  isSaving,
  savingTheme,
  darkPreviewUrl,
  lightPreviewUrl,
  mobilePreviewUrl,
}: {
  open: boolean
  onClose: () => void
  onUpload: (theme: DashboardBackgroundTheme) => void
  onClear: (theme: DashboardBackgroundTheme) => void
  isSaving: boolean
  savingTheme: DashboardBackgroundTheme | null
  darkPreviewUrl: string | null
  lightPreviewUrl: string | null
  mobilePreviewUrl: string | null
}) {
  const slots: BackgroundSlot[] = [
    { theme: 'dark', label: 'Dark mode', previewUrl: darkPreviewUrl },
    { theme: 'light', label: 'Light mode', previewUrl: lightPreviewUrl },
    {
      theme: 'mobile',
      label: 'Mobile',
      hint: 'Dùng trên màn hình nhỏ (≤768px)',
      previewUrl: mobilePreviewUrl,
    },
  ]

  return (
    <Modal
      title="Ảnh nền dashboard"
      open={open}
      onCancel={onClose}
      width={480}
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
      ]}
    >
      <p className="text-sm text-[var(--color-text-muted)] mb-4">
        Thêm ảnh riêng cho dark/light trên desktop, và một ảnh mobile dùng chung khi màn nhỏ.
      </p>

      <div className="space-y-4">
        {slots.map(({ theme, label, hint, previewUrl }) => {
          const isCurrentSaving = isSaving && savingTheme === theme

          return (
            <div
              key={theme}
              className="rounded-xl border border-[var(--color-border)] overflow-hidden"
            >
              <div
                className="h-28 bg-[var(--color-surface-muted)] bg-cover bg-center"
                style={previewUrl ? { backgroundImage: `url("${previewUrl}")` } : undefined}
              >
                {!previewUrl && (
                  <div className="h-full flex items-center justify-center text-xs text-[var(--color-text-subtle)]">
                    Chưa có ảnh
                  </div>
                )}
              </div>

              <div className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{label}</span>
                  {hint && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{hint}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="small"
                    onClick={() => onUpload(theme)}
                    loading={isCurrentSaving}
                    disabled={isSaving && !isCurrentSaving}
                  >
                    {previewUrl ? 'Đổi ảnh' : 'Chọn ảnh'}
                  </Button>
                  {previewUrl && (
                    <Button
                      size="small"
                      danger
                      onClick={() => onClear(theme)}
                      loading={isCurrentSaving}
                      disabled={isSaving && !isCurrentSaving}
                    >
                      Xóa
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function useClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

function padTwo(n: number) {
  return String(n).padStart(2, '0')
}

function buildBackgroundUrl(url: string | null, updatedAt: string | null) {
  if (!url) return null
  if (!updatedAt) return url
  return `${url}?v=${encodeURIComponent(updatedAt)}`
}

function settingsToBackgrounds(settings: DashboardSettingsDTO) {
  return {
    dark: {
      // Hardcoded path; presence gated by updatedAt from API (file on disk)
      url: settings.backgroundUpdatedAtDark ? DASHBOARD_BACKGROUND_URLS.dark : null,
      updatedAt: settings.backgroundUpdatedAtDark,
    },
    light: {
      url: settings.backgroundUpdatedAtLight ? DASHBOARD_BACKGROUND_URLS.light : null,
      updatedAt: settings.backgroundUpdatedAtLight,
    },
    mobile: {
      url: settings.backgroundUpdatedAtMobile ? DASHBOARD_BACKGROUND_URLS.mobile : null,
      updatedAt: settings.backgroundUpdatedAtMobile,
    },
  }
}

function emptyDashboardSettings(): DashboardSettingsDTO {
  return {
    backgroundImageUrlDark: null,
    backgroundImageUrlLight: null,
    backgroundImageUrlMobile: null,
    backgroundUpdatedAtDark: null,
    backgroundUpdatedAtLight: null,
    backgroundUpdatedAtMobile: null,
    createdAt: '',
    updatedAt: '',
  }
}

function dropTargetLabel(theme: DashboardBackgroundTheme) {
  if (theme === 'mobile') return 'mobile'
  return theme === 'dark' ? 'dark mode' : 'light mode'
}

interface Props {
  currentTrack: TrackDTO | null
  isPlaying: boolean
  onTogglePlay: () => void
  onNext: () => void
  onPrev: () => void
  musicProgress: number
  musicDuration: number
  onSeek: (value: number) => void
  volume: number
  onVolumeChange: (value: number) => void
  onOpenBookDetail?: (bookId: string) => void
}

export default function DashboardPage({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  musicProgress,
  musicDuration,
  onSeek,
  volume,
  onVolumeChange,
  onOpenBookDetail,
}: Props) {
  const time = useClock()
  const rootRef = useRef<HTMLDivElement>(null)
  const { isDarkMode } = useAppTheme()
  const isMobileViewport = useMediaQuery('(max-width: 768px)')
  const [backgrounds, setBackgrounds] = useState(() => settingsToBackgrounds(emptyDashboardSettings()))
  const [isDragging, setIsDragging] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savingTheme, setSavingTheme] = useState<DashboardBackgroundTheme | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingUploadThemeRef = useRef<DashboardBackgroundTheme | null>(null)
  const [recentBook, setRecentBook] = useState<LocalLibraryListItemDTO | null>(null)
  const [journalMessages, setJournalMessages] = useState<JournalMessageDTO[]>([])
  const [journalLoading, setJournalLoading] = useState(true)

  const themeSlot: Exclude<DashboardBackgroundTheme, 'mobile'> = isDarkMode ? 'dark' : 'light'
  const dropTargetTheme: DashboardBackgroundTheme = isMobileViewport ? 'mobile' : themeSlot
  const activeBackground = isMobileViewport && backgrounds.mobile.url
    ? backgrounds.mobile
    : backgrounds[themeSlot]
  const hasBg = Boolean(activeBackground.url)
  const darkPreviewUrl = buildBackgroundUrl(backgrounds.dark.url, backgrounds.dark.updatedAt)
  const lightPreviewUrl = buildBackgroundUrl(backgrounds.light.url, backgrounds.light.updatedAt)
  const mobilePreviewUrl = buildBackgroundUrl(backgrounds.mobile.url, backgrounds.mobile.updatedAt)

  const hours = padTwo(time.getHours())
  const minutes = padTwo(time.getMinutes())
  const seconds = padTwo(time.getSeconds())

  const dateStr = time.toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const journalDayKey = formatJournalDayHcm(time)

  useEffect(() => {
    applyDashboardTheme(rootRef.current, {
      isDarkMode,
      hasBackground: hasBg,
    })
  }, [isDarkMode, hasBg])

  useEffect(() => {
    let cancelled = false

    async function loadDashboardSettings() {
      try {
        const settings = await fetchDashboardSettings()
        if (cancelled) return
        setBackgrounds(settingsToBackgrounds(settings))
      } catch {
        if (cancelled) return
        setBackgrounds(settingsToBackgrounds(emptyDashboardSettings()))
      }
    }

    void loadDashboardSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadJournalMessages() {
      setJournalLoading(true)
      try {
        const messages = await fetchDashboardJournalMessages(new Date())
        if (cancelled) return
        setJournalMessages(messages)
      } catch {
        if (cancelled) return
        setJournalMessages([])
      } finally {
        if (!cancelled) setJournalLoading(false)
      }
    }

    void loadJournalMessages()

    return () => {
      cancelled = true
    }
  }, [journalDayKey])

  useEffect(() => {
    let cancelled = false

    async function loadRecentBook() {
      try {
        const result = await fetchLocalLibrary({ sort: 'last_read_desc', limit: 1 })
        if (cancelled) return
        if (result.items.length > 0) {
          setRecentBook(result.items[0])
        }
      } catch {
        if (cancelled) return
        setRecentBook(null)
      }
    }

    void loadRecentBook()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!modalOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setModalOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [modalOpen])

  async function applyBackgroundFile(theme: DashboardBackgroundTheme, file: File | null) {
    if (!file || !file.type.startsWith('image/')) return
    setIsSaving(true)
    setSavingTheme(theme)
    try {
      const settings = await updateDashboardBackground(theme, file)
      setBackgrounds(settingsToBackgrounds(settings))
    } finally {
      setIsSaving(false)
      setSavingTheme(null)
    }
  }

  async function handleClearBackground(theme: DashboardBackgroundTheme) {
    setIsSaving(true)
    setSavingTheme(theme)
    try {
      const settings = await clearDashboardBackground(theme)
      setBackgrounds(settingsToBackgrounds(settings))
    } finally {
      setIsSaving(false)
      setSavingTheme(null)
    }
  }

  function handleUploadRequest(theme: DashboardBackgroundTheme) {
    pendingUploadThemeRef.current = theme
    fileInputRef.current?.click()
  }

  async function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    const theme = pendingUploadThemeRef.current ?? dropTargetTheme
    e.target.value = ''
    pendingUploadThemeRef.current = null
    await applyBackgroundFile(theme, file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    void applyBackgroundFile(dropTargetTheme, e.dataTransfer.files?.[0] ?? null)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget === e.target) setIsDragging(false)
  }

  const resolvedBackgroundUrl = buildBackgroundUrl(activeBackground.url, activeBackground.updatedAt)
  const backgroundStyle = resolvedBackgroundUrl
    ? {
      backgroundImage: `url("${resolvedBackgroundUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
    : {}

  return (
    <div
      ref={rootRef}
      className="dashboard-root"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={backgroundStyle}
    >
      <div className="dashboard-no-bg-scrim" aria-hidden="true" />

      {isDragging && (
        <div className="dashboard-drag-hint">
          <svg className="w-10 h-10 mb-3 opacity-80" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
          </svg>
          <span>Thả ảnh vào đây cho {dropTargetLabel(dropTargetTheme)}</span>
        </div>
      )}

      <div className="dashboard-content">
        <section className="dashboard-hero-screen">
          <div className="dashboard-card dashboard-clock-card">
            <div className="dashboard-clock-section">
              <p className="dashboard-date">{dateStr}</p>

              <div className="dashboard-clock" aria-label={`${hours}:${minutes}:${seconds}`}>
                <span className="dashboard-clock-hm">
                  {hours}
                  <span className="dashboard-clock-colon">:</span>
                  {minutes}
                </span>
                <span className="dashboard-clock-seconds">{seconds}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-content-screen">
          <div className="dashboard-cards">
            <div className="dashboard-card">
              <div className="dashboard-book-card">
                <div className="dashboard-book-top">
                  <div className="dashboard-book-cover">
                    {recentBook?.hasCover ? (() => {
                      const coverUrl = getLocalLibraryCoverUrl(recentBook)
                      return coverUrl ? (
                        <img
                          src={coverUrl}
                          alt=""
                          className="dashboard-book-cover-img"
                        />
                      ) : (
                        <div className="dashboard-book-cover-placeholder">
                          <span className="anticon">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                              <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
                            </svg>
                          </span>
                        </div>
                      )
                    })() : (
                      <div className="dashboard-book-cover-placeholder">
                        <span className="anticon">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                            <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />
                          </svg>
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="dashboard-book-info">
                    <div className="dashboard-book-info-head">
                      <p className="dashboard-book-title">{recentBook?.title || 'Chưa có sách'}</p>
                      {recentBook && onOpenBookDetail ? (
                        <button
                          type="button"
                          className="dashboard-book-detail-btn"
                          onClick={() => onOpenBookDetail(recentBook.id)}
                          aria-label="Xem chi tiết sách"
                          title="Xem chi tiết"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
                            <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                    <p className="dashboard-book-meta">{recentBook ? (recentBook.source === 'hako' ? 'DocLN' : recentBook.source === 'epub' ? 'EPUB' : 'PDF') : '--'}</p>
                  </div>
                </div>
                <div className="dashboard-book-progress">
                  <div className="dashboard-progress-labels">
                    <span>Tiến độ</span>
                    <span>{recentBook?.lastReadAt ? 'Đang đọc' : 'Chưa đọc'}</span>
                  </div>
                  <div className="dashboard-progress-bar">
                    <div className="dashboard-progress-fill" style={{ width: recentBook?.lastReadAt ? '45%' : '0%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="dashboard-card dashboard-card-music">
              {currentTrack ? (
                <>
                  <div className="dashboard-music-content">
                    <div className="dashboard-music-top">
                      <p className="dashboard-music-title">{currentTrack.filename}</p>
                    </div>
                    <div className="dashboard-music-middle">
                      <div className="dashboard-music-cover">
                        {currentTrack.hasCover ? (
                          <img
                            src={`/api/cover/${currentTrack.id}`}
                            alt=""
                            className="dashboard-music-cover-img"
                          />
                        ) : (
                          <div className="dashboard-music-cover-placeholder">
                            <span className="anticon">
                              <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                              </svg>
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="dashboard-music-details">
                        <p className="dashboard-music-artist">{currentTrack.artist || 'Unknown Artist'}</p>
                        <div className="dashboard-music-controls">
                          <button className="dashboard-music-btn" onClick={onPrev}>
                            <span className="anticon">
                              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
                              </svg>
                            </span>
                          </button>
                          <button className="dashboard-music-btn dashboard-music-btn-play" onClick={onTogglePlay}>
                            <span className="anticon">
                              {isPlaying ? (
                                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                                  <path d="M6 19h4V5H6zm8-14v14h4V5z" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              )}
                            </span>
                          </button>
                          <button className="dashboard-music-btn" onClick={onNext}>
                            <span className="anticon">
                              <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                <path d="M6 18l8.5-6L6 6v12zm2-8.14 5.12 3.64-5.12 3.64V9.86zM16 6h2v12h-2z" />
                              </svg>
                            </span>
                          </button>
                          <div className="dashboard-music-volume">
                            <button className="dashboard-music-btn dashboard-music-volume-btn">
                              <span className="anticon">
                                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                </svg>
                              </span>
                            </button>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={volume}
                              className="dashboard-music-volume-slider"
                              onChange={(e) => {
                                onVolumeChange(Number(e.target.value))
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="dashboard-music-bottom">
                      <span className="dashboard-music-time">{formatDuration(musicProgress)}</span>
                      <Slider
                        min={0}
                        max={musicDuration || 100}
                        value={musicProgress}
                        onChange={onSeek}
                        tooltip={{ formatter: (value) => formatDuration(value as number) }}
                        className="dashboard-music-slider"
                      />
                      <span className="dashboard-music-time">{formatDuration(musicDuration)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="dashboard-music-placeholder">
                  <span className="anticon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                  </span>
                  <p>Không có nhạc đang phát</p>
                </div>
              )}
            </div>

            <div className="dashboard-card dashboard-card-journal">
              <div className="dashboard-journal-content">
                {journalLoading ? (
                  <p className="dashboard-journal-empty">Đang tải nhật ký...</p>
                ) : journalMessages.length === 0 ? (
                  <p className="dashboard-journal-empty">Chưa có nhật ký ngày này năm trước</p>
                ) : (
                  <div className="dashboard-journal-messages">
                    {journalMessages.map(message => (
                      <article key={message.id} className="dashboard-journal-message">
                        <time className="dashboard-journal-time" dateTime={message.timestamp}>
                          {formatJournalDateTime(message.timestamp)}
                        </time>
                        <p className="dashboard-journal-text">{getJournalMessageText(message)}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="dashboard-fab">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          id="dashboard-bg-input"
          aria-label="Chọn ảnh nền"
          onChange={handleInputChange}
        />
        <button
          type="button"
          className="dashboard-fab-button"
          title="Chỉnh ảnh nền"
          aria-label="Chỉnh ảnh nền"
          onClick={() => setModalOpen(true)}
          disabled={isSaving}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm14.71-9.04c.39-.39.39-1.02 0-1.41l-2.5-2.5a.9959.9959 0 1 0-1.41 1.41l2.5 2.5c.39.39 1.02.39 1.41 0z" />
          </svg>
        </button>
      </div>

      <BackgroundSettingsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onUpload={handleUploadRequest}
        onClear={handleClearBackground}
        isSaving={isSaving}
        savingTheme={savingTheme}
        darkPreviewUrl={darkPreviewUrl}
        lightPreviewUrl={lightPreviewUrl}
        mobilePreviewUrl={mobilePreviewUrl}
      />

      {!hasBg && (
        <span className="dashboard-drop-hint">
          hoặc kéo thả ảnh vào đây ({dropTargetLabel(dropTargetTheme)})
        </span>
      )}
    </div>
  )
}
