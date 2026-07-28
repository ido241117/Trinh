import dayjs, { type Dayjs } from 'dayjs'
import type { JournalMessageDTO, TrackDTO } from '../../types'

export const JOURNAL_MUSIC_CHECKPOINT_FILENAME = 'Yung Kai - Blue'

export type JournalTimelineItem =
  | { kind: 'message'; id: string; sortTime: string; message: JournalMessageDTO }
  | { kind: 'track'; id: string; sortTime: string; track: TrackDTO }

export function filterJournalMusicTracks(tracks: TrackDTO[]): TrackDTO[] {
  const checkpoint = tracks.find(track => track.filename === JOURNAL_MUSIC_CHECKPOINT_FILENAME)
  if (!checkpoint) return []

  const checkpointTime = new Date(checkpoint.dateModified).getTime()
  return tracks.filter(track => new Date(track.dateModified).getTime() >= checkpointTime)
}

export function filterJournalMusicByDate(
  tracks: TrackDTO[],
  filters: {
    afterDate?: Dayjs | null
    beforeDate?: Dayjs | null
    month?: Dayjs | null
  },
): TrackDTO[] {
  let result = tracks

  if (filters.month) {
    const monthKey = filters.month.format('YYYY-MM')
    result = result.filter(track => dayjs(track.dateModified).format('YYYY-MM') === monthKey)
  } else {
    if (filters.afterDate) {
      result = result.filter(track => !dayjs(track.dateModified).isBefore(filters.afterDate, 'day'))
    }
    if (filters.beforeDate) {
      result = result.filter(track => !dayjs(track.dateModified).isAfter(filters.beforeDate, 'day'))
    }
  }

  return result
}

/** Hide music older than loaded messages while older journal pages are still pending. */
export function filterJournalMusicByLoadedWindow(
  tracks: TrackDTO[],
  messages: JournalMessageDTO[],
  hasMoreMessages: boolean,
): TrackDTO[] {
  if (!hasMoreMessages || messages.length === 0) return tracks

  const oldestLoadedTime = messages[0].timestamp
  return tracks.filter(track => track.dateModified >= oldestLoadedTime)
}

export function buildJournalTimeline(
  messages: JournalMessageDTO[],
  tracks: TrackDTO[],
): JournalTimelineItem[] {
  const items: JournalTimelineItem[] = [
    ...messages.map(message => ({
      kind: 'message' as const,
      id: `message:${message.id}`,
      sortTime: message.timestamp,
      message,
    })),
    ...tracks.map(track => ({
      kind: 'track' as const,
      id: `track:${track.id}`,
      sortTime: track.dateModified,
      track,
    })),
  ]

  return items.sort((left, right) => {
    const byTime = left.sortTime.localeCompare(right.sortTime)
    if (byTime !== 0) return byTime
    return left.id.localeCompare(right.id)
  })
}
