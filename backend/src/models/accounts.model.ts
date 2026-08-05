import type { Collection } from 'mongodb'
import { getDb } from '../db.js'
import type { AccountDocument } from '../types.js'

export function getAccountsCollection(): Collection<AccountDocument> {
  return getDb().collection<AccountDocument>('accounts')
}
