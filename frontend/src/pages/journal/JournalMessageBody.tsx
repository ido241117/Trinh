import { Image } from 'antd'
import type { JournalAttachmentDTO } from '../../types'
import { DiscordMarkdown } from './DiscordMarkdown'
import { JournalLocationBlock, JournalYoutubeBlock } from './JournalEmbedBlocks'
import { splitJournalContent } from './journalLocation'

function isImageAttachment(contentType?: string, fileName?: string) {
  if (contentType?.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp)$/i.test(fileName ?? '')
}

interface JournalMessageBodyProps {
  content: string
  highlightTerm?: string
  attachments: JournalAttachmentDTO[]
  isSingleImage: boolean
  onAttachmentImageLoad?: () => void
}

export function JournalMessageBody({
  content,
  highlightTerm = '',
  attachments,
  isSingleImage,
  onAttachmentImageLoad,
}: JournalMessageBodyProps) {
  const parsed = splitJournalContent(content)
  const hasText = Boolean(parsed.text.trim())

  return (
    <>
      {parsed.locations.length > 0 ? (
        <div className="journal-message-locations">
          {parsed.locations.map((location, index) => (
            <JournalLocationBlock key={`${location.lat}-${location.long}-${index}`} location={location} />
          ))}
        </div>
      ) : null}
      {parsed.youtubeLinks.length > 0 ? (
        <div className="journal-message-youtube-list">
          {parsed.youtubeLinks.map((link, index) => (
            <JournalYoutubeBlock key={`${link.videoId}-${index}`} link={link} />
          ))}
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div className={`journal-attachments${isSingleImage ? ' is-single-image' : ''}`}>
          {attachments.map(attachment => (
            isImageAttachment(attachment.contentType, attachment.fileName) ? (
              <Image
                key={attachment.originalUrl}
                src={attachment.url}
                alt={attachment.fileName}
                width={isSingleImage ? undefined : 180}
                className="journal-attachment-image"
                onLoad={onAttachmentImageLoad}
              />
            ) : (
              <a key={attachment.originalUrl} href={attachment.url} target="_blank" rel="noreferrer">
                {attachment.fileName}
              </a>
            )
          ))}
        </div>
      ) : null}
      {hasText ? <DiscordMarkdown content={parsed.text} highlightTerm={highlightTerm} /> : null}
    </>
  )
}
