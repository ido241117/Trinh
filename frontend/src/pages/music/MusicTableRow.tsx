import { memo, type HTMLAttributes } from 'react'
import { useDeferredNowPlayingId } from './MusicNowPlayingContext'

type RowProps = HTMLAttributes<HTMLTableRowElement> & {
  'data-row-key'?: React.Key
}

function MusicTableRow({ className, ...props }: RowProps) {
  const deferredCurrentTrackId = useDeferredNowPlayingId()
  const rowKey = props['data-row-key']
  const isActive = rowKey != null && String(rowKey) === deferredCurrentTrackId
  const mergedClassName = [className, 'music-row', isActive && 'is-active'].filter(Boolean).join(' ')

  return <tr {...props} className={mergedClassName} />
}

export default memo(MusicTableRow)
