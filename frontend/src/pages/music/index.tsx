import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DeleteOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Alert, Button, DatePicker, Empty, Input, Modal, Select, Tooltip, message } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { deleteTrack, downloadYoutube } from '../../api'
import type { SortField, SortOrder, TrackDTO, LibraryDateFilterMode } from '../../types'
import EditTrackModal from './EditTrackModal'
import MusicTrackTable from './MusicTrackTable'
import './music.css'

type FilterMode = 'default' | 'month' | 'monthAllYears' | 'last30'
const MUSIC_FILTER_MODE_STORAGE_KEY = 'music-filter-mode'
const MUSIC_FILTER_MONTH_STORAGE_KEY = 'music-filter-month'

function readStoredFilterMode(): FilterMode {
  try {
    const raw = window.localStorage.getItem(MUSIC_FILTER_MODE_STORAGE_KEY)
    if (raw === 'default' || raw === 'month' || raw === 'monthAllYears' || raw === 'last30') {
      return raw
    }
  } catch {
    // Storage is best-effort; fall back to the default filter if unavailable.
  }
  return 'last30'
}

function persistFilterMode(value: FilterMode) {
  try {
    window.localStorage.setItem(MUSIC_FILTER_MODE_STORAGE_KEY, value)
  } catch {
    // Ignore storage errors so the page keeps working normally.
  }
}

function readStoredSelectedMonth(): Dayjs {
  try {
    const raw = window.localStorage.getItem(MUSIC_FILTER_MONTH_STORAGE_KEY)
    if (raw) {
      const parsed = dayjs(raw, 'YYYY-MM', true)
      if (parsed.isValid()) return parsed
    }
  } catch {
    // Storage is best-effort; fall back to the current month if unavailable.
  }
  return dayjs()
}

function persistSelectedMonth(value: Dayjs) {
  try {
    window.localStorage.setItem(MUSIC_FILTER_MONTH_STORAGE_KEY, value.format('YYYY-MM'))
  } catch {
    // Ignore storage errors so the page keeps working normally.
  }
}

interface Props {
  tracks: TrackDTO[]
  isEmpty: boolean
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  paginated?: boolean
  error: string | null
  search: string
  setSearch: (v: string) => void
  sortField: SortField
  setSortField: (v: SortField) => void
  sortOrder: SortOrder
  setSortOrder: (fn: (o: SortOrder) => SortOrder) => void
  setDateFilter?: (mode: LibraryDateFilterMode, month?: string) => void
  loadMore?: () => void
  listResetKey?: number
  rescan: () => void
  upsertTrack: (track: TrackDTO) => void
  removeTrack: (id: string) => void
  onTrackClick: (id: string) => void
}

export default function MusicMvpPage({
  tracks,
  isEmpty,
  loading,
  loadingMore = false,
  hasMore = false,
  paginated = false,
  error,
  search,
  setSearch,
  sortField,
  setSortField,
  sortOrder,
  setSortOrder,
  setDateFilter,
  loadMore,
  listResetKey,
  rescan,
  upsertTrack,
  removeTrack,
  onTrackClick,
}: Props) {
  const [editingTrack, setEditingTrack] = useState<TrackDTO | null>(null)
  const [filterMode, setFilterMode] = useState<FilterMode>(readStoredFilterMode)
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(readStoredSelectedMonth)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    persistFilterMode(filterMode)
  }, [filterMode])

  useEffect(() => {
    persistSelectedMonth(selectedMonth)
  }, [selectedMonth])

  useEffect(() => {
    if (!paginated || !setDateFilter) return
    setDateFilter(filterMode, selectedMonth.format('YYYY-MM'))
  }, [paginated, filterMode, selectedMonth, setDateFilter])

  const filteredTracks = useMemo(() => {
    if (paginated) return tracks

    if (filterMode === 'default') return tracks

    if (filterMode === 'last30') {
      const cutoff = dayjs().subtract(30, 'day').startOf('day')
      return tracks.filter(track => dayjs(track.dateModified).isAfter(cutoff))
    }

    if (filterMode === 'monthAllYears') {
      return tracks.filter(track => dayjs(track.dateModified).month() === selectedMonth.month())
    }

    return tracks.filter(track => dayjs(track.dateModified).isSame(selectedMonth, 'month'))
  }, [filterMode, paginated, selectedMonth, tracks])

  const handleSortChange = useCallback((field: SortField, order: SortOrder) => {
    setSortField(field)
    setSortOrder(() => order)
  }, [setSortField, setSortOrder])

  const handleEditTrack = useCallback((track: TrackDTO) => {
    setEditingTrack(track)
  }, [])

  const handleDeleteTrack = useCallback((track: TrackDTO) => {
    Modal.confirm({
      title: 'Delete track',
      icon: <DeleteOutlined />,
      content: `Are you sure you want to delete "${track.filename}"? This will remove the audio file, cover image, and database record.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteTrack(track.id)
          message.success('Track deleted successfully')
          removeTrack(track.id)
        } catch (err) {
          message.error(err instanceof Error ? err.message : 'Failed to delete track')
        }
      },
    })
  }, [removeTrack])

  function handleDownload() {
    const url = downloadUrl.trim()
    if (!url || downloading) return

    setDownloading(true)
    downloadYoutube(
      url,
      () => {},
      (doneMessage, track) => {
        setDownloading(false)
        setDownloadUrl('')
        message.success(doneMessage || 'Download complete')
        if (track) upsertTrack(track)
      },
      msg => {
        setDownloading(false)
        message.error(msg || 'Download failed')
      },
    )
  }

  return (
    <section className="music-page" role="main">
      <header className="music-toolbar">
        <Input
          allowClear
          type="search"
          prefix={<SearchOutlined />}
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search tracks"
          className="music-toolbar-search"
        />
        <Select<FilterMode>
          value={filterMode}
          onChange={setFilterMode}
          className="music-toolbar-filter"
          options={[
            { value: 'default', label: 'Default' },
            { value: 'month', label: 'By month' },
            { value: 'monthAllYears', label: 'Month all years' },
            { value: 'last30', label: 'Last 30 days' },
          ]}
        />
        {(filterMode === 'month' || filterMode === 'monthAllYears') && (
          <DatePicker
            picker="month"
            allowClear={false}
            value={selectedMonth}
            onChange={value => value && setSelectedMonth(value)}
            className="music-toolbar-month"
          />
        )}
        <Tooltip title="Rescan library">
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={rescan}
            className="music-toolbar-icon-btn music-toolbar-rescan-btn"
          />
        </Tooltip>
        <span className="music-toolbar-sep" aria-hidden="true" />
        <Input
          value={downloadUrl}
          onChange={event => setDownloadUrl(event.target.value)}
          onPressEnter={handleDownload}
          disabled={downloading}
          placeholder="Paste YouTube URL"
          className="music-toolbar-download"
        />
        <Tooltip title="Download from YouTube">
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={downloading}
            disabled={!downloadUrl.trim()}
            onClick={handleDownload}
            className="music-toolbar-icon-btn music-toolbar-download-btn"
          />
        </Tooltip>
      </header>

      {error && (
        <Alert
          showIcon
          type="error"
          message="Library error"
          description={error}
          className="music-alert"
        />
      )}

      {!loading && isEmpty ? (
        <div className="music-empty">
          <Empty description="No tracks in library">
            <Button type="primary" icon={<ReloadOutlined />} onClick={rescan}>
              Scan library
            </Button>
          </Empty>
        </div>
      ) : (
        <MusicTrackTable
          tracks={filteredTracks}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          listResetKey={listResetKey}
          search={search}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          onTrackClick={onTrackClick}
          onEditTrack={handleEditTrack}
          onDeleteTrack={handleDeleteTrack}
        />
      )}

      <EditTrackModal
        track={editingTrack}
        open={Boolean(editingTrack)}
        onClose={() => setEditingTrack(null)}
        onTrackUpdated={track => {
          upsertTrack(track)
          setEditingTrack(null)
        }}
      />
    </section>
  )
}
