import { parseJournalYoutubeMarker, formatJournalYoutubeMarker, type JournalYoutubeLink } from './journalYoutube'

export interface JournalLocation {
  lat: number
  long: number
}

export type { JournalYoutubeLink }

const JOURNAL_LOCATION_MARKER_PATTERN = /^\[\[location:([-\d.]+),([-\d.]+)\]\]$/

export function parseJournalLocationMarker(line: string): JournalLocation | null {
  const match = JOURNAL_LOCATION_MARKER_PATTERN.exec(line.trim())
  if (!match) return null
  const lat = Number(match[1])
  const long = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(long)) return null
  if (lat < -90 || lat > 90 || long < -180 || long > 180) return null
  return { lat, long }
}

export function formatJournalLocationMarker(location: JournalLocation) {
  return `[[location:${location.lat},${location.long}]]`
}

export function buildGoogleMapsSearchUrl(location: JournalLocation) {
  return `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.long}`
}

export function parseJournalLocationInput(latValue: string, longValue: string): JournalLocation | null {
  const lat = Number(latValue.trim())
  const long = Number(longValue.trim())
  if (!Number.isFinite(lat) || !Number.isFinite(long)) return null
  if (lat < -90 || lat > 90 || long < -180 || long > 180) return null
  return { lat, long }
}

const BROWSER_LOCATION_ERROR_MESSAGES: Record<number, string> = {
  1: 'Bạn đã từ chối quyền truy cập vị trí',
  2: 'Không lấy được vị trí',
  3: 'Hết thời gian chờ khi lấy vị trí',
}

export function getBrowserJournalLocation(): Promise<JournalLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ định vị'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: position.coords.latitude,
          long: position.coords.longitude,
        })
      },
      error => {
        reject(new Error(BROWSER_LOCATION_ERROR_MESSAGES[error.code] ?? 'Không lấy được vị trí'))
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  })
}

export function splitJournalContent(content: string): {
  text: string
  locations: JournalLocation[]
  youtubeLinks: JournalYoutubeLink[]
} {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const locations: JournalLocation[] = []
  const youtubeLinks: JournalYoutubeLink[] = []
  const textLines: string[] = []

  for (const line of lines) {
    const location = parseJournalLocationMarker(line)
    if (location) {
      locations.push(location)
      continue
    }
    const youtubeLink = parseJournalYoutubeMarker(line)
    if (youtubeLink) {
      youtubeLinks.push(youtubeLink)
      continue
    }
    textLines.push(line)
  }

  return { text: textLines.join('\n').trimEnd(), locations, youtubeLinks }
}

export function buildJournalContent(
  text: string,
  locations: JournalLocation[],
  youtubeLinks: JournalYoutubeLink[] = [],
) {
  const textContent = text.trim()
  const locationMarkers = locations.map(location => formatJournalLocationMarker(location))
  const youtubeMarkers = youtubeLinks.map(link => formatJournalYoutubeMarker(link))
  return [...locationMarkers, ...youtubeMarkers, textContent].filter(Boolean).join('\n')
}
