export interface JournalYoutubeLink {
  videoId: string
  title: string
  url: string
  thumbnailUrl: string
}

const JOURNAL_YOUTUBE_MARKER_PATTERN = /^\[\[youtube:([A-Za-z0-9_-]{11})\|([^|]+)\|(.+)\]\]$/

export function buildYoutubeThumbnailUrl(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

export function parseJournalYoutubeMarker(line: string): JournalYoutubeLink | null {
  const match = JOURNAL_YOUTUBE_MARKER_PATTERN.exec(line.trim())
  if (!match) return null

  try {
    const videoId = match[1]
    return {
      videoId,
      title: decodeURIComponent(match[2]),
      url: decodeURIComponent(match[3]),
      thumbnailUrl: buildYoutubeThumbnailUrl(videoId),
    }
  } catch {
    return null
  }
}

export function formatJournalYoutubeMarker(link: Pick<JournalYoutubeLink, 'videoId' | 'title' | 'url'>) {
  return `[[youtube:${link.videoId}|${encodeURIComponent(link.title)}|${encodeURIComponent(link.url)}]]`
}
