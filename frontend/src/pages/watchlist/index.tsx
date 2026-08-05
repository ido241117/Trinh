import { useEffect, useState } from 'react'
import {
  DeleteOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Image, Input, List, Popconfirm, Space, Spin, Typography, message } from 'antd'
import type { WatchlistItemDTO } from '../../types'
import { deleteWatchlistItem, fetchWatchlist, saveWatchlistItem } from '../../api'
import './watchlist.css'

const YT_REGEX = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/

function isValidYouTubeUrl(url: string): boolean {
  return YT_REGEX.test(url)
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItemDTO[]>([])
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setFetching(true)
    fetchWatchlist()
      .then(data => {
        if (!cancelled) setItems(data)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch watchlist')
      })
      .finally(() => {
        if (!cancelled) setFetching(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave() {
    const nextUrl = url.trim()
    if (!nextUrl || saving) return

    setSaving(true)
    setError(null)
    try {
      const item = await saveWatchlistItem(nextUrl)
      setItems(prev => [item, ...prev])
      setUrl('')
      message.success('Saved to playlist')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteWatchlistItem(id)
      setItems(prev => prev.filter(item => item.id !== id))
      message.success('Removed from playlist')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  function openVideo(item: WatchlistItemDTO) {
    window.open(item.url, '_blank', 'noopener')
  }

  const urlWarning = url.length > 0 && !isValidYouTubeUrl(url)

  return (
    <section className="watchlist-page" role="main">
      <header className="watchlist-header">
        <div>
          <Typography.Title level={3} className="watchlist-title">
            LEGACY PLAYLIST
          </Typography.Title>
          <Typography.Text type="secondary">{items.length} saved links</Typography.Text>
        </div>
      </header>

      <div className="watchlist-input-bar">
        <Input
          id="watchlist-url-input"
          type="url"
          prefix={<LinkOutlined />}
          value={url}
          onChange={event => {
            setUrl(event.target.value)
            setError(null)
          }}
          onPressEnter={handleSave}
          placeholder="Paste YouTube URL"
          status={urlWarning ? 'warning' : undefined}
          disabled={saving}
        />
        <Button
          id="watchlist-save-button"
          type="primary"
          icon={<PlusOutlined />}
          loading={saving}
          disabled={!url.trim()}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>

      {urlWarning && (
        <Typography.Text type="warning" className="watchlist-warning">
          URL này có vẻ không phải YouTube - thử lưu vẫn được.
        </Typography.Text>
      )}

      {error && (
        <Alert
          showIcon
          type="error"
          message="Playlist error"
          description={error}
          className="watchlist-alert"
        />
      )}

      <div className="watchlist-panel">
        {fetching ? (
          <div className="watchlist-loading">
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty description="No saved links yet" />
        ) : (
          <List
            dataSource={items}
            itemLayout="horizontal"
            renderItem={item => (
              <List.Item
                className="watchlist-row"
                onClick={() => openVideo(item)}
                actions={[
                  <Popconfirm
                    key="delete"
                    title="Xóa link này khỏi playlist?"
                    onConfirm={event => {
                      event?.stopPropagation()
                      return handleDelete(item.id)
                    }}
                    onCancel={event => event?.stopPropagation()}
                    okText="Xóa"
                    cancelText="Hủy"
                  >
                    <Button
                      danger
                      type="text"
                      shape="circle"
                      icon={<DeleteOutlined />}
                      aria-label="Delete from playlist"
                      onClick={event => event.stopPropagation()}
                    />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Image
                      src={item.thumbnailUrl}
                      alt={item.title}
                      width={160}
                      height={90}
                      preview={false}
                      className="watchlist-thumb"
                    />
                  }
                  title={
                    <button
                      type="button"
                      className="watchlist-link-title"
                      onClick={event => {
                        event.stopPropagation()
                        openVideo(item)
                      }}
                    >
                      {item.title}
                    </button>
                  }
                  description={
                    <Space direction="vertical" size={2} className="watchlist-meta">
                      <Typography.Text type="secondary" ellipsis>
                        {item.url.replace(/^https?:\/\//, '')}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {new Date(item.savedAt).toLocaleString('en-GB')}
                      </Typography.Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </section>
  )
}
