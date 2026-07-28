import { useEffect, useRef, useState } from 'react'
import { ConfigProvider, theme } from 'antd'
import { usePlayer } from './hooks/usePlayer'
import { useLibrary } from './hooks/useLibrary'
import { useMediaQuery } from './hooks/useMediaQuery'
import Sidebar from './components/Sidebar/Sidebar'
import MusicMvpPage from './pages/music'
import { NowPlayingProvider } from './pages/music/MusicNowPlayingContext'
import WatchlistPage from './pages/watchlist'
import LocalLibraryPage from './pages/local-library'
import JournalPage from './pages/journal'
import { AiQuotaPage } from './pages/ai-quota'
import DashboardPage from './pages/dashboard'
import Player from './components/Player/Player'
import { AppThemeProvider, type AppTheme } from './context/AppThemeContext'
import type { Tab } from './components/Sidebar/Sidebar'
import './index.css'

const ACTIVE_TAB_STORAGE_KEY = 'app-active-tab'
const THEME_STORAGE_KEY = 'app-theme'
const VOLUME_STORAGE_KEY = 'player-volume'

const THEME_COLORS = {
  light: {
    primary: '#0a84ff',
    primaryHover: '#0070e0',
    primarySurfaceSoft: '#f5f9ff',
    tableHeader: '#f8fbff',
    surface: '#ffffff',
    border: '#e5e7eb',
    text: '#111827',
    textMuted: '#64748b',
  },
  dark: {
    primary: '#0a84ff',
    primaryHover: '#3399ff',
    primarySurfaceSoft: '#252d36',
    tableHeader: '#252526',
    surface: '#1f1f1f',
    border: '#3c3c3c',
    text: '#d4d4d4',
    textMuted: '#9da3aa',
  },
}

function isTab(value: string | null): value is Tab {
  return value === 'dashboard' || value === 'music' || value === 'watchlist' || value === 'local-library' || value === 'journal' || value === 'ai-quota'
}

function isTheme(value: string | null): value is AppTheme {
  return value === 'light' || value === 'dark'
}

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY)
    if (raw === null) return 1
    const v = Number(raw)
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v
  } catch {
    // ignore quota / private mode
  }
  return 1
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const stored = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)
    if (stored === 'books') return 'local-library'
    return isTab(stored) ? stored : 'music'
  })
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    const theme = isTheme(stored) ? stored : 'light'
    document.documentElement.classList.toggle('dark', theme === 'dark')
    return theme
  })
  const [localLibraryInitialBookId, setLocalLibraryInitialBookId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [musicProgress, setMusicProgress] = useState(0)
  const [musicDuration, setMusicDuration] = useState(0)
  const [volume, setVolume] = useState(readStoredVolume)
  const themeColors = THEME_COLORS[appTheme]

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab)
  }, [activeTab])

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, appTheme)
    document.documentElement.classList.toggle('dark', appTheme === 'dark')
  }, [appTheme])

  const isMobile = useMediaQuery('(max-width: 768px)')

  const {
    tracks, isEmpty, loading, loadingMore, hasMore, error,
    search, setSearch,
    sortField, setSortField,
    sortOrder, setSortOrder,
    setDateFilter, loadMore,
    listResetKey,
    rescan, upsertTrack, removeTrack,
  } = useLibrary({ paginated: isMobile })

  const {
    currentTrackId, currentTrack, isPlaying,
    shuffle, repeat,
    play, togglePlay, stop, next, prev,
    setShuffle, setRepeat,
  } = usePlayer(tracks)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return

    const handleTimeUpdate = () => setMusicProgress(audio.currentTime)
    const handleLoadedMetadata = () => setMusicDuration(audio.duration)
    const handleEnded = () => {
      if (repeat === 'one') {
        audio.currentTime = 0
        audio.play().catch(() => {})
        return
      }
      next()
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [currentTrack, next, repeat])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
  }, [volume, currentTrack?.id])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return
    if (isPlaying) audio.play().catch(() => {})
    else audio.pause()
  }, [isPlaying, currentTrack])

  useEffect(() => {
    if (!currentTrack) {
      setMusicProgress(0)
      setMusicDuration(0)
    }
  }, [currentTrack?.id])

  function handleSeek(value: number) {
    const audio = audioRef.current
    if (audio) audio.currentTime = value
    setMusicProgress(value)
  }

  function handleVolume(value: number) {
    setVolume(value)
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(value))
    } catch {
      // ignore quota / private mode
    }
  }

  function openLocalLibraryBookDetail(bookId: string) {
    setLocalLibraryInitialBookId(bookId)
    setActiveTab('local-library')
  }

  return (
    <AppThemeProvider theme={appTheme} setTheme={setAppTheme}>
    <ConfigProvider
      theme={{
        algorithm: appTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: themeColors.primary,
          colorPrimaryHover: themeColors.primaryHover,
          colorInfo: themeColors.primary,
          colorBgContainer: themeColors.surface,
          colorBorder: themeColors.border,
          colorText: themeColors.text,
          colorTextSecondary: themeColors.textMuted,
          borderRadius: 8,
          fontFamily: '"Inter", "Segoe UI Variable", "Segoe UI", sans-serif',
        },
        components: {
          Table: {
            rowHoverBg: themeColors.primarySurfaceSoft,
            headerBg: themeColors.tableHeader,
            headerSortActiveBg: themeColors.tableHeader,
            headerSortHoverBg: themeColors.primarySurfaceSoft,
            bodySortBg: themeColors.surface,
            borderColor: themeColors.border,
          },
          Button: {
            controlHeight: 36,
          },
          Input: {
            controlHeight: 38,
          },
        },
      }}
    >
      <div className="app-shell h-screen bg-[var(--color-root-bg)] text-[var(--color-text)] flex flex-col">
        <div className="app-shell-body flex flex-1 min-h-0 overflow-hidden">
          <Sidebar
            activeTab={activeTab}
            appTheme={appTheme}
            onThemeChange={setAppTheme}
            onTabChange={setActiveTab}
          />

          <div className="app-shell-main flex-1 min-h-0 overflow-hidden">
            {activeTab === 'dashboard' && (
              <DashboardPage
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                onNext={next}
                onPrev={prev}
                musicProgress={musicProgress}
                musicDuration={musicDuration}
                onSeek={handleSeek}
                volume={volume}
                onVolumeChange={handleVolume}
                onOpenBookDetail={openLocalLibraryBookDetail}
              />
            )}
            {activeTab === 'music' && (
              <NowPlayingProvider trackId={currentTrackId}>
                <MusicMvpPage
                  tracks={tracks}
                  isEmpty={isEmpty}
                  loading={loading}
                  loadingMore={loadingMore}
                  hasMore={hasMore}
                  paginated={isMobile}
                  error={error}
                  search={search}
                  setSearch={setSearch}
                  sortField={sortField}
                  setSortField={setSortField}
                  sortOrder={sortOrder}
                  setSortOrder={setSortOrder}
                  setDateFilter={setDateFilter}
                  loadMore={loadMore}
                  listResetKey={listResetKey}
                  rescan={rescan}
                  upsertTrack={upsertTrack}
                  removeTrack={removeTrack}
                  onTrackClick={play}
                />
              </NowPlayingProvider>
            )}
            {activeTab === 'watchlist' && <WatchlistPage />}
            {activeTab === 'local-library' && (
              <LocalLibraryPage
                initialBookId={localLibraryInitialBookId}
                onInitialBookIdConsumed={() => setLocalLibraryInitialBookId(null)}
              />
            )}
            {activeTab === 'journal' && <JournalPage onTrackClick={play} />}
            {activeTab === 'ai-quota' && <AiQuotaPage />}
          </div>
        </div>

        {activeTab !== 'dashboard' && (
          <Player
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            shuffle={shuffle}
            repeat={repeat}
            onTogglePlay={togglePlay}
            onStop={stop}
            onNext={next}
            onPrev={prev}
            onSetShuffle={setShuffle}
            onSetRepeat={setRepeat}
            audioRef={audioRef}
            progress={musicProgress}
            duration={musicDuration}
            onSeek={handleSeek}
            volume={volume}
            onVolumeChange={handleVolume}
          />
        )}

        {currentTrack && (
          <audio
            ref={audioRef}
            src={`/api/stream/${currentTrack.id}`}
          />
        )}
      </div>
    </ConfigProvider>
    </AppThemeProvider>
  )
}
