import { EnvironmentOutlined } from '@ant-design/icons'
import { buildGoogleMapsSearchUrl, type JournalLocation } from './journalLocation'
import type { JournalYoutubeLink } from './journalYoutube'

export function JournalLocationBlock({ location }: { location: JournalLocation }) {
  return (
    <div className="journal-md-location">
      <a
        className="journal-location-button"
        href={buildGoogleMapsSearchUrl(location)}
        target="_blank"
        rel="noreferrer"
      >
        <EnvironmentOutlined aria-hidden />
        Mở Google Maps
      </a>
    </div>
  )
}

export function JournalYoutubeBlock({ link }: { link: JournalYoutubeLink }) {
  return (
    <div className="journal-md-youtube">
      <a
        className="journal-youtube-card"
        href={link.url}
        target="_blank"
        rel="noreferrer"
      >
        <img className="journal-youtube-thumb" src={link.thumbnailUrl} alt="" />
        <span className="journal-youtube-title">{link.title}</span>
      </a>
    </div>
  )
}
