import { memo } from 'react'
import { CustomerServiceOutlined } from '@ant-design/icons'
import { Avatar, Typography } from 'antd'
import type { TrackDTO } from '../../types'
import { formatDate, formatDuration } from '../../utils'

interface Props {
  track: TrackDTO
  onClick?: (id: string) => void
}

function JournalMusicCard({ track, onClick }: Props) {
  return (
    <button
      type="button"
      className="journal-music-card"
      onClick={() => onClick?.(track.id)}
      disabled={!onClick}
    >
      <Avatar
        shape="square"
        size={40}
        src={track.hasCover ? `/api/cover/${track.id}` : undefined}
        icon={<CustomerServiceOutlined />}
        className="journal-music-card-cover"
      />
      <div className="journal-music-card-content">
        <div className="journal-music-card-main">
          <span className="journal-music-card-title">{track.filename}</span>
          <Typography.Text type="secondary" ellipsis className="journal-music-card-artist">
            {track.artist || 'Unknown artist'}
          </Typography.Text>
        </div>
        <div className="journal-music-card-meta">
          <Typography.Text type="secondary" className="journal-music-card-date">
            {formatDate(track.dateModified)}
          </Typography.Text>
          <span className="journal-music-card-duration">{formatDuration(track.duration)}</span>
        </div>
      </div>
    </button>
  )
}

export default memo(JournalMusicCard)
