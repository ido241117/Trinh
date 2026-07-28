import { MongoClient, Db } from 'mongodb'

let client: MongoClient | null = null
let db: Db | null = null
let journalDb: Db | null = null
let localLibraryDb: Db | null = null
let aiQuotaDb: Db | null = null

export async function connectDb(): Promise<void> {
  const url = process.env.MONGODB_URL ?? 'mongodb://localhost:27017'
  const dbName = process.env.MONGODB_DB ?? 'musicplayer'
  const journalDbName = process.env.JOURNAL_MONGODB_DB ?? 'projectd_discord'
  const localLibraryDbName = process.env.LOCAL_LIBRARY_MONGODB_DB ?? 'Projectd_d3'
  const aiQuotaDbName = process.env.AI_QUOTA_MONGODB_DB ?? 'ai_quota'
  client = new MongoClient(url)
  await client.connect()
  db = client.db(dbName)
  journalDb = client.db(journalDbName)
  localLibraryDb = client.db(localLibraryDbName)
  aiQuotaDb = client.db(aiQuotaDbName)
}

export function getDb(): Db {
  if (!db) throw new Error('Database not connected. Call connectDb() first.')
  return db
}

export function getJournalDb(): Db {
  if (!journalDb) throw new Error('Database not connected. Call connectDb() first.')
  return journalDb
}

export function getLocalLibraryDb(): Db {
  if (!localLibraryDb) throw new Error('Database not connected. Call connectDb() first.')
  return localLibraryDb
}

export function getAiQuotaDb(): Db {
  if (!aiQuotaDb) throw new Error('Database not connected. Call connectDb() first.')
  return aiQuotaDb
}

export async function closeDb(): Promise<void> {
  await client?.close()
  client = null
  db = null
  journalDb = null
  localLibraryDb = null
  aiQuotaDb = null
}
