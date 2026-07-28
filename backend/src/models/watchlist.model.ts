import type { Collection } from 'mongodb'
import { getDb } from '../db.js'

export interface WatchlistDocument {
  _id: string          // = videoId (YouTube video ID string)
  videoId: string
  url: string
  title: string
  thumbnailUrl: string
  savedAt: string      // ISO 8601
}

export async function getWatchlistCollection(): Promise<Collection<WatchlistDocument>> {
  const col = getDb().collection<WatchlistDocument>('watchlist')
  // Ensure unique index on videoId (idempotent)
  await col.createIndex({ videoId: 1 }, { unique: true, background: true })
  return col
}
