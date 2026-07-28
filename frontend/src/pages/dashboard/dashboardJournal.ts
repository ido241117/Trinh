import { fetchJournalMessages } from '../../api'
import type { JournalMessageDTO } from '../../types'
import { splitJournalContent } from '../journal/journalLocation'

const HCM_TIMEZONE = 'Asia/Ho_Chi_Minh'
const MIN_CARD_CHARS = 400
const MAX_DAYS_BACK = 366

export function formatJournalDayHcm(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HCM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatJournalDateTime(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    hour12: false,
    timeZone: HCM_TIMEZONE,
  })
}

function shiftDayHcm(day: string, deltaDays: number): string {
  const anchor = new Date(`${day}T12:00:00.000+07:00`)
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays)
  return formatJournalDayHcm(anchor)
}

function getFlashbackStartDay(reference: Date): string {
  const today = formatJournalDayHcm(reference)
  const [year, month, day] = today.split('-')
  return `${Number(year) - 1}-${month}-${day}`
}

export function getJournalMessageText(message: JournalMessageDTO): string {
  return splitJournalContent(message.content).text.trim()
}

export async function fetchDashboardJournalMessages(reference: Date): Promise<JournalMessageDTO[]> {
  const collected: JournalMessageDTO[] = []
  const seenIds = new Set<string>()
  let totalChars = 0
  const startDay = getFlashbackStartDay(reference)

  for (let daysBack = 0; daysBack < MAX_DAYS_BACK; daysBack += 1) {
    const day = shiftDayHcm(startDay, -daysBack)
    const result = await fetchJournalMessages({ day, limit: 100 })
    const dayMessages = [...result.items]
      .filter(message => {
        if (seenIds.has(message.id)) return false
        return getJournalMessageText(message).length > 0
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    for (const message of dayMessages) {
      seenIds.add(message.id)
      collected.push(message)
      totalChars += getJournalMessageText(message).length
    }

    if (totalChars >= MIN_CARD_CHARS) break
  }

  return collected.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}
