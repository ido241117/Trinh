import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type UIEvent } from 'react'
import { CustomerServiceOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Avatar, Button, Empty, Select, Space, Table, Tooltip, Typography } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { FilterValue, SorterResult, TableCurrentDataSource } from 'antd/es/table/interface'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { SortField, SortOrder, TrackDTO } from '../../types'
import { formatDate, formatDuration } from '../../utils'
import { useDeferredNowPlayingId } from './MusicNowPlayingContext'
import MusicTableRow from './MusicTableRow'

const TABLE_SCROLL_X_DESKTOP = 868
const VIRTUAL_ROW_HEIGHT = 60
const MOBILE_VIRTUAL_ROW_HEIGHT = 86
const MOBILE_OVERSCAN_ROWS = 6
const MOBILE_LOAD_MORE_THRESHOLD_PX = 240

function measureTableBodyHeight(container: HTMLElement): number {
  const header = container.querySelector('.ant-table-thead')
  const headerHeight = header?.getBoundingClientRect().height ?? 0
  return Math.max(120, Math.floor(container.clientHeight - headerHeight))
}

interface Props {
  tracks: TrackDTO[]
  loading: boolean
  loadingMore?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  listResetKey?: number
  search: string
  sortField: SortField
  sortOrder: SortOrder
  onSortChange: (field: SortField, order: SortOrder) => void
  onTrackClick: (id: string) => void
  onEditTrack: (track: TrackDTO) => void
  onDeleteTrack: (track: TrackDTO) => void
}

function MusicTrackTable({
  tracks,
  loading,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  listResetKey = 0,
  search,
  sortField,
  sortOrder,
  onSortChange,
  onTrackClick,
  onEditTrack,
  onDeleteTrack,
}: Props) {
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const [scrollY, setScrollY] = useState(400)
  const [mobileScrollTop, setMobileScrollTop] = useState(0)
  const [mobileViewportHeight, setMobileViewportHeight] = useState(480)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const deferredCurrentTrackId = useDeferredNowPlayingId()

  useEffect(() => {
    if (isMobile) return
    const element = tableWrapRef.current
    if (!element) return

    const updateScrollY = () => {
      setScrollY(measureTableBodyHeight(element))
    }

    const observer = new ResizeObserver(updateScrollY)
    observer.observe(element)

    const header = element.querySelector('.ant-table-thead')
    if (header) observer.observe(header)

    updateScrollY()
    window.addEventListener('resize', updateScrollY)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScrollY)
    }
  }, [isMobile, loading, tracks.length])

  useEffect(() => {
    if (!isMobile) return
    setMobileScrollTop(0)
    if (mobileScrollRef.current) {
      mobileScrollRef.current.scrollTop = 0
    }
  }, [isMobile, listResetKey])

  useEffect(() => {
    if (!isMobile) return
    const container = mobileScrollRef.current
    if (!container) return
    const updateHeight = () => {
      setMobileViewportHeight(Math.max(200, Math.floor(container.clientHeight)))
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(container)
    return () => observer.disconnect()
  }, [isMobile])

  const sortFieldLabelMap: Record<SortField, string> = useMemo(() => ({
    filename: 'Track name',
    duration: 'Duration',
    dateModified: 'Modified date',
  }), [])

  const columns: ColumnsType<TrackDTO> = useMemo(() => {
    const trackColumn: ColumnsType<TrackDTO>[number] = {
      title: 'Track',
      dataIndex: 'filename',
      key: 'filename',
      width: isMobile ? 220 : 360,
      sorter: true,
      sortOrder: sortField === 'filename' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (_, track) => (
        <Space size={10} className="music-track-cell">
          <Avatar
            shape="square"
            size={isMobile ? 36 : 40}
            src={track.hasCover ? `/api/cover/${track.id}` : undefined}
            icon={<CustomerServiceOutlined />}
            className="music-cover"
          />
          <div className="music-track-meta">
            <span className="music-track-title">{track.filename}</span>
            <span className="music-track-artist-mobile">{track.artist || 'Unknown artist'}</span>
          </div>
        </Space>
      ),
    }

    return [
      trackColumn,
      {
        title: 'Artist',
        dataIndex: 'artist',
        key: 'artist',
        width: 180,
        render: value => (
          <Typography.Text type="secondary" ellipsis className="music-artist">
            {value || 'Unknown artist'}
          </Typography.Text>
        ),
      },
      {
        title: 'Modified',
        dataIndex: 'dateModified',
        key: 'dateModified',
        sorter: true,
        width: 180,
        sortOrder: sortField === 'dateModified' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
        render: value => <Typography.Text type="secondary">{formatDate(value as string)}</Typography.Text>,
      },
      {
        title: 'Lenght',
        dataIndex: 'duration',
        key: 'duration',
        sorter: true,
        width: 92,
        align: 'right',
        sortOrder: sortField === 'duration' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
        render: value => <span className="music-tabular">{formatDuration(value as number)}</span>,
      },
      {
        title: '',
        key: 'actions',
        width: 100,
        align: 'right',
        render: (_, track) => (
          <Space size={4}>
            <Tooltip title="Edit">
              <Button
                type="text"
                shape="circle"
                icon={<EditOutlined />}
                onClick={event => {
                  event.stopPropagation()
                  onEditTrack(track)
                }}
              />
            </Tooltip>
            <Tooltip title="Delete">
              <Button
                type="text"
                shape="circle"
                danger
                icon={<DeleteOutlined />}
                onClick={event => {
                  event.stopPropagation()
                  onDeleteTrack(track)
                }}
              />
            </Tooltip>
          </Space>
        ),
      },
    ]
  }, [isMobile, onDeleteTrack, onEditTrack, sortField, sortOrder])

  const handleSortFieldChange = useCallback((value: SortField) => {
    onSortChange(value, sortOrder)
  }, [onSortChange, sortOrder])

  const handleToggleSortOrder = useCallback(() => {
    onSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')
  }, [onSortChange, sortField, sortOrder])

  const handleMobileScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget
    setMobileScrollTop(container.scrollTop)

    if (!hasMore || loadingMore || loading || !onLoadMore) return
    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight
    if (remaining <= MOBILE_LOAD_MORE_THRESHOLD_PX) {
      onLoadMore()
    }
  }, [hasMore, loadingMore, loading, onLoadMore])

  const mobileVirtualWindow = useMemo(() => {
    const total = tracks.length
    const startIndex = Math.max(
      0,
      Math.floor(mobileScrollTop / MOBILE_VIRTUAL_ROW_HEIGHT) - MOBILE_OVERSCAN_ROWS,
    )
    const visibleRows = Math.ceil(mobileViewportHeight / MOBILE_VIRTUAL_ROW_HEIGHT)
    const endIndex = Math.min(total, startIndex + visibleRows + MOBILE_OVERSCAN_ROWS * 2)
    const offsetTop = startIndex * MOBILE_VIRTUAL_ROW_HEIGHT
    const offsetBottom = Math.max(0, (total - endIndex) * MOBILE_VIRTUAL_ROW_HEIGHT)
    return { startIndex, endIndex, offsetTop, offsetBottom }
  }, [mobileScrollTop, tracks.length, mobileViewportHeight])

  const mobileVisibleTracks = useMemo(
    () => tracks.slice(mobileVirtualWindow.startIndex, mobileVirtualWindow.endIndex),
    [tracks, mobileVirtualWindow.endIndex, mobileVirtualWindow.startIndex],
  )

  const handleTableChange = useCallback((
    _pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<TrackDTO> | SorterResult<TrackDTO>[],
    _extra: TableCurrentDataSource<TrackDTO>,
  ) => {
    const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter
    if (!activeSorter.field || !activeSorter.order) return

    onSortChange(
      activeSorter.field as SortField,
      activeSorter.order === 'ascend' ? 'asc' : 'desc',
    )
  }, [onSortChange])

  const handleRow = useCallback((track: TrackDTO) => ({
    onClick: () => onTrackClick(track.id),
  }), [onTrackClick])

  return (
    <div ref={tableWrapRef} className="music-table-wrap">
      {isMobile ? (
        <>
          <div className="music-list-toolbar">
            <Select<SortField>
              value={sortField}
              onChange={handleSortFieldChange}
              options={[
                { value: 'filename', label: 'Track name' },
                { value: 'duration', label: 'Duration' },
                { value: 'dateModified', label: 'Modified date' },
              ]}
              className="music-list-sort-field"
              aria-label="Sort tracks by"
            />
            <Button onClick={handleToggleSortOrder} className="music-list-sort-order">
              {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            </Button>
          </div>
          <div
            ref={mobileScrollRef}
            className="music-list-scroll"
            aria-label={`Sorted by ${sortFieldLabelMap[sortField]}`}
            onScroll={handleMobileScroll}
          >
            {tracks.length === 0 ? (
              <div className="music-list-empty">
                <Empty description={search.trim() ? 'No matching tracks' : 'No tracks'} />
              </div>
            ) : (
              <div className="music-track-list">
                {mobileVirtualWindow.offsetTop > 0 && (
                  <div
                    className="music-track-spacer"
                    style={{ height: `${mobileVirtualWindow.offsetTop}px` }}
                    aria-hidden="true"
                  />
                )}
                {mobileVisibleTracks.map(track => {
                  const isActive = track.id === deferredCurrentTrackId
                  return (
                    <article
                      key={track.id}
                      className={`music-track-card${isActive ? ' is-active' : ''}`}
                      onClick={() => onTrackClick(track.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onTrackClick(track.id)
                        }
                      }}
                    >
                      {track.hasCover ? (
                        <img
                          src={`/api/cover/${track.id}`}
                          alt={track.filename}
                          loading="lazy"
                          decoding="async"
                          className="music-cover music-cover-image"
                        />
                      ) : (
                        <Avatar
                          shape="square"
                          size={56}
                          icon={<CustomerServiceOutlined />}
                          className="music-cover"
                        />
                      )}
                      <div className="music-track-meta">
                        <span className="music-track-title">{track.filename}</span>
                        <span className="music-track-artist-mobile">{track.artist || 'Unknown artist'}</span>
                        <div className="music-track-details">
                          <Typography.Text type="secondary">{formatDate(track.dateModified)}</Typography.Text>
                          <span className="music-tabular">{formatDuration(track.duration)}</span>
                        </div>
                      </div>
                      <Space size={4} className="music-track-actions">
                        <Tooltip title="Edit">
                          <Button
                            type="text"
                            shape="circle"
                            icon={<EditOutlined />}
                            onClick={event => {
                              event.stopPropagation()
                              onEditTrack(track)
                            }}
                          />
                        </Tooltip>
                        <Tooltip title="Delete">
                          <Button
                            type="text"
                            shape="circle"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={event => {
                              event.stopPropagation()
                              onDeleteTrack(track)
                            }}
                          />
                        </Tooltip>
                      </Space>
                    </article>
                  )
                })}
                {mobileVirtualWindow.offsetBottom > 0 && (
                  <div
                    className="music-track-spacer"
                    style={{ height: `${mobileVirtualWindow.offsetBottom}px` }}
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
          </div>
          {loadingMore && (
            <div className="music-list-loading">Loading more tracks...</div>
          )}
          {loading && <div className="music-list-loading">Loading tracks...</div>}
        </>
      ) : (
        <Table<TrackDTO>
          rowKey="id"
          virtual
          columns={columns}
          dataSource={tracks}
          loading={loading}
          pagination={false}
          tableLayout="fixed"
          scroll={{ x: TABLE_SCROLL_X_DESKTOP, y: scrollY }}
          onChange={handleTableChange}
          onRow={handleRow}
          components={{
            body: {
              row: MusicTableRow,
              listItemHeight: VIRTUAL_ROW_HEIGHT,
            },
          // listItemHeight is consumed by rc-table virtual body but omitted from antd types.
          } as NonNullable<ComponentProps<typeof Table>['components']>}
          locale={{
            emptyText: search.trim() ? 'No matching tracks' : 'No tracks',
          }}
        />
      )}
    </div>
  )
}

export default memo(MusicTrackTable)
