import type { Collection } from 'mongodb'
import { getJournalDb } from '../db.js'

export interface JournalLocalAttachment {
  originalUrl: string
  fileName: string
  url: string
  contentType?: string
  sizeBytes?: number
  downloadedAt: Date | string
}

export interface JournalMessageDocument {
  _id: string
  messageId: string
  guildId?: string
  channelId?: string
  channelName?: string
  author: string
  timestamp: Date
  content: string
  attachments: string[]
  localAttachments?: JournalLocalAttachment[]
  hasAttachments: boolean
  rawText?: string
  importedAt?: Date | string
  createdAt?: Date | string
  updatedAt?: Date | string
  pinned?: boolean
  pinnedAt?: Date | string
  source?: Record<string, unknown>
}

export function getJournalMessagesCollection(): Collection<JournalMessageDocument> {
  return getJournalDb().collection<JournalMessageDocument>('messages')
}
