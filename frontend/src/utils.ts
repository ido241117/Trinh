export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function splitDuration(totalSeconds: number): { minutes: number; seconds: number } {
  const safe = Math.max(0, Math.floor(totalSeconds))
  return { minutes: Math.floor(safe / 60), seconds: safe % 60 }
}

export function joinDuration(minutes: number, seconds: number): number {
  return Math.max(0, minutes) * 60 + Math.min(59, Math.max(0, seconds))
}

export function clampDuration(seconds: number, max?: number): number {
  const clamped = Math.max(0, Math.floor(seconds))
  if (max === undefined) return clamped
  return Math.min(clamped, max)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return `${date} ${time}`
}

export function formatDateDdMmYyyy(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Value for `<input type="datetime-local">` from ISO string (local timezone). */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parse datetime-local input to ISO string for API. */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString()
}
