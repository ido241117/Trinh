import type { Collection } from 'mongodb'
import { getDb } from '../db.js'

// MongoDB document shape — absolutePath is stored but never sent to frontend
export interface TrackDocument {
  _id: string          // MD5(absolutePath) — same as Track.id
  filename: string
  absolutePath: string
  dateModified: string
  duration: number
  format: string
  artist?: string
  album?: string
  hasCover: boolean
  coverFile?: string | null
  scannedAt: string
}

export function getTrackCollection(): Collection<TrackDocument> {
  return getDb().collection<TrackDocument>('tracks')
}
