import type { Collection } from 'mongodb'
import { getAiQuotaDb } from '../db.js'
import type { AiQuotaServiceDocument } from '../types.js'

export function getAiQuotaServicesCollection(): Collection<AiQuotaServiceDocument> {
  return getAiQuotaDb().collection<AiQuotaServiceDocument>('ai_quota_services')
}
