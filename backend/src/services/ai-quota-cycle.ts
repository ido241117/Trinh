import type { CycleRule, CycleState, DurationCycleRule, MonthlyDayCycleRule, WeeklyDayCycleRule, DateRangeCycleRule } from '../types.js'

const HCM_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_START_HOUR = 6
const MS_PER_HCM_DAY = 24 * 60 * 60 * 1000

/** Instant → HCM timeline where each "day" starts at 6:00 Asia/Ho_Chi_Minh */
function toHcmTimelineMs(date: Date): number {
  return date.getTime() + HCM_OFFSET_MS - DAY_START_HOUR * 60 * 60 * 1000
}

function fromHcmTimelineMs(timelineMs: number): Date {
  return new Date(timelineMs - HCM_OFFSET_MS + DAY_START_HOUR * 60 * 60 * 1000)
}

/** 6:00 AM Asia/Ho_Chi_Minh on the HCM-day that contains `date` */
function getHcmDayStart(date: Date): Date {
  const dayIndex = Math.floor(toHcmTimelineMs(date) / MS_PER_HCM_DAY)
  return fromHcmTimelineMs(dayIndex * MS_PER_HCM_DAY)
}

/** Parse YYYY-MM-DD as 6:00 AM on that calendar date in Asia/Ho_Chi_Minh */
function parseHcmAnchorDate(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    return new Date(Date.UTC(year, month - 1, day, 6, 0, 0, 0) - HCM_OFFSET_MS)
  }

  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return null
  return getHcmDayStart(parsed)
}

/** Get the number of days in a given month (UTC) */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Compute next reset for monthly-day cycle rule (6:00 AM HCM on dayOfMonth) */
function computeMonthlyDayNextReset(rule: MonthlyDayCycleRule, now: Date): Date {
  // Convert now to HCM timeline to determine which month we're in
  const hcmNow = toHcmTimelineMs(now)
  const hcmNowDate = fromHcmTimelineMs(hcmNow)
  let year = hcmNowDate.getUTCFullYear()
  let month = hcmNowDate.getUTCMonth() // 0-11

  // Check if dayOfMonth is valid for current month, if not use last day
  const daysInCurrentMonth = getDaysInMonth(year, month)
  let targetDay = Math.min(rule.dayOfMonth, daysInCurrentMonth)

  // Create candidate reset date (6:00 AM HCM → UTC is 6 - 7 = 23:00 previous day UTC)
  let candidate = new Date(Date.UTC(year, month, targetDay, 6, 0, 0, 0) - HCM_OFFSET_MS)

  // If candidate is <= now, try next month
  if (candidate.getTime() <= now.getTime()) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    const daysInNextMonth = getDaysInMonth(year, month)
    targetDay = Math.min(rule.dayOfMonth, daysInNextMonth)
    candidate = new Date(Date.UTC(year, month, targetDay, 6, 0, 0, 0) - HCM_OFFSET_MS)
  }

  return candidate
}

/** Compute next reset for weekly-day cycle rule (6:00 AM HCM on dayOfWeek) */
function computeWeeklyDayNextReset(rule: WeeklyDayCycleRule, now: Date): Date {
  // Get current day of week in HCM timeline
  const hcmNow = toHcmTimelineMs(now)
  const hcmNowDate = fromHcmTimelineMs(hcmNow)
  const currentDayOfWeek = hcmNowDate.getUTCDay()
  const targetDayOfWeek = rule.dayOfWeek
  
  // Calculate days to add to reach target day
  const daysToAdd = (targetDayOfWeek - currentDayOfWeek + 7) % 7
  
  // Calculate next reset: start from now, add days to reach target day at 6:00 AM
  // First, get the HCM day start of the target day
  const targetDayStartMs = toHcmTimelineMs(hcmNowDate) + daysToAdd * MS_PER_HCM_DAY
  const targetDayStart = fromHcmTimelineMs(targetDayStartMs)
  
  // Set to 6:00 AM HCM on that day
  let candidate = new Date(Date.UTC(
    targetDayStart.getUTCFullYear(),
    targetDayStart.getUTCMonth(),
    targetDayStart.getUTCDate(),
    6, 0, 0, 0
  ) - HCM_OFFSET_MS)
  
  // If candidate is <= now, move to next week
  if (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + 7 * MS_PER_HCM_DAY)
  }
  
  return candidate
}

/** Compute previous reset for monthly-day cycle rule (6:00 AM HCM on dayOfMonth) */
function computeMonthlyDayPrevReset(rule: MonthlyDayCycleRule, now: Date): Date {
  // Convert now to HCM timeline to determine which month we're in
  const hcmNow = toHcmTimelineMs(now)
  const hcmNowDate = fromHcmTimelineMs(hcmNow)
  let year = hcmNowDate.getUTCFullYear()
  let month = hcmNowDate.getUTCMonth() // 0-11

  // Check if dayOfMonth is valid for current month, if not use last day
  const daysInCurrentMonth = getDaysInMonth(year, month)
  let targetDay = Math.min(rule.dayOfMonth, daysInCurrentMonth)

  // Create candidate reset date (6:00 AM HCM)
  let candidate = new Date(Date.UTC(year, month, targetDay, 6, 0, 0, 0) - HCM_OFFSET_MS)

  // If candidate is > now, then the previous reset was in the previous month
  if (candidate.getTime() > now.getTime()) {
    month -= 1
    if (month < 0) {
      month = 11
      year -= 1
    }
    const daysInPrevMonth = getDaysInMonth(year, month)
    targetDay = Math.min(rule.dayOfMonth, daysInPrevMonth)
    candidate = new Date(Date.UTC(year, month, targetDay, 6, 0, 0, 0) - HCM_OFFSET_MS)
  }

  return candidate
}

function normalizeCycleRule(cycleRule: CycleRule): DurationCycleRule {
  if (cycleRule.type === 'duration') {
    return {
      type: 'duration',
      value: cycleRule.value,
      anchorDate: cycleRule.anchorDate,
    }
  }
  if (cycleRule.type === 'monthly-day') {
    // Fallback to 30 days duration for compatibility if needed
    return { type: 'duration', value: 30 }
  }
  if (cycleRule.type === 'weekly-day') {
    // Fallback to 7 days duration for compatibility if needed
    return { type: 'duration', value: 7 }
  }
  if (cycleRule.type === 'date-range') {
    // For date-range, calculate days between start and end
    const start = new Date(cycleRule.startDate)
    const end = new Date(cycleRule.endDate)
    const days = Math.ceil((end.getTime() - start.getTime()) / MS_PER_HCM_DAY)
    return { type: 'duration', value: Math.max(1, days) }
  }

  // Legacy records saved before the days-only model
  if (cycleRule.type === 'rolling') {
    return { type: 'duration', value: cycleRule.value }
  }

  const days = cycleRule.anchor === 'weekly' ? 7 : cycleRule.dayOfMonth ?? 30
  return { type: 'duration', value: days }
}

function computeNextResetAt(rule: DurationCycleRule | MonthlyDayCycleRule | WeeklyDayCycleRule, lastReset: Date, now: Date): Date {
  if (rule.type === 'monthly-day') {
    return computeMonthlyDayNextReset(rule, now)
  }
  if (rule.type === 'weekly-day') {
    return computeWeeklyDayNextReset(rule, now)
  }

  const intervalMs = rule.value * MS_PER_HCM_DAY

  if (rule.anchorDate) {
    const anchor = parseHcmAnchorDate(rule.anchorDate)
    if (!anchor) {
      return computeRollingNextReset(rule.value, lastReset, now)
    }

    const elapsed = toHcmTimelineMs(now) - toHcmTimelineMs(anchor)
    const periodsPassed = Math.floor(elapsed / intervalMs)
    return fromHcmTimelineMs(toHcmTimelineMs(anchor) + (periodsPassed + 1) * intervalMs)
  }

  return computeRollingNextReset(rule.value, lastReset, now)
}

/** Next reset = lastReset's HCM-day start + N full HCM-days (each 6:00–6:00) */
function computeRollingNextReset(days: number, lastReset: Date, now: Date): Date {
  const intervalMs = days * MS_PER_HCM_DAY
  const resetDayStart = getHcmDayStart(lastReset)
  let nextReset = fromHcmTimelineMs(toHcmTimelineMs(resetDayStart) + intervalMs)

  while (nextReset.getTime() <= now.getTime()) {
    nextReset = fromHcmTimelineMs(toHcmTimelineMs(nextReset) + intervalMs)
  }

  return nextReset
}

export function computeCycleState(
  cycleRule: CycleRule,
  lastResetAt: string,
  now: Date = new Date(),
): CycleState {
  const lastReset = new Date(lastResetAt)
  // For monthly-day and weekly-day, don't use normalizeCycleRule, use the actual rule
  let nextResetAt: Date
  let prevResetAt: Date
  if (cycleRule.type === 'monthly-day') {
    nextResetAt = computeMonthlyDayNextReset(cycleRule, now)
    prevResetAt = computeMonthlyDayPrevReset(cycleRule, now)
  } else if (cycleRule.type === 'weekly-day') {
    nextResetAt = computeWeeklyDayNextReset(cycleRule, now)
    // Previous reset is 7 days before next reset
    prevResetAt = new Date(nextResetAt.getTime() - 7 * MS_PER_HCM_DAY)
  } else if (cycleRule.type === 'date-range') {
    // For date-range, use startDate as prevReset and endDate as nextReset
    prevResetAt = new Date(cycleRule.startDate)
    nextResetAt = new Date(cycleRule.endDate)
  } else {
    const rule = normalizeCycleRule(cycleRule)
    nextResetAt = computeNextResetAt(rule, lastReset, now)
    const intervalMs = rule.value * MS_PER_HCM_DAY
    prevResetAt = new Date(nextResetAt.getTime() - intervalMs)
  }
  const elapsedMs = now.getTime() - prevResetAt.getTime()
  const remainingMs = nextResetAt.getTime() - now.getTime()

  return {
    nextResetAt: nextResetAt.toISOString(),
    prevResetAt: prevResetAt.toISOString(),
    elapsedMs,
    remainingMs,
    statusText: formatStatusText(remainingMs),
    progressPercent: calculateProgressPercent(elapsedMs, remainingMs),
  }
}

function formatStatusText(remainingMs: number): string {
  if (remainingMs > 0) {
    return `Còn ${formatDuration(remainingMs)} nữa đến hạn reset`
  }
  return `Đã trôi qua ${formatDuration(Math.abs(remainingMs))} kể từ lần reset`
}

function formatDuration(ms: number): string {
  const totalHours = Math.floor(ms / (60 * 60 * 1000))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  const parts: string[] = []
  if (days > 0) parts.push(`${days} ngày`)
  if (hours > 0) parts.push(`${hours} giờ`)
  if (parts.length === 0) return 'vài phút'

  return parts.join(' ')
}

function calculateProgressPercent(elapsedMs: number, remainingMs: number): number {
  const total = elapsedMs + remainingMs
  if (total === 0) return 0
  return Math.max(0, Math.min(100, (elapsedMs / total) * 100))
}
