export interface Track {
  id: string
  filename: string
  absolutePath: string  // internal — stripped before API response
  dateModified: string  // ISO string from fs.stat().mtime — never write to file
  duration: number      // seconds
  format: string        // 'mp3' | 'wav' | 'flac' | etc.
  artist?: string       // only present if non-empty in metadata
  album?: string        // only present if non-empty in metadata
  hasCover: boolean     // Sprint 2: detected during scan, avoids 563 cover requests on load
  coverFile?: string | null  // filename in configured image folder (e.g. '<id>.jpg'), null if no cover
}

export type TrackDTO = Omit<Track, 'absolutePath'>

export interface WatchlistItemDTO {
  id: string          // _id.toString() (= videoId)
  videoId: string
  url: string
  title: string
  thumbnailUrl: string
  savedAt: string     // ISO 8601
}

export interface BookReadingProgressLocationDTO {
  locationKey: string
  spineIndex?: number
  chapterPath?: string
  scrollPercent?: number
  scrollTop?: number
  savedAt?: string
}

export interface BookReadingProgressDTO {
  activeLocationKey?: string
  locations: BookReadingProgressLocationDTO[]
}

export type LocalLibrarySourceDTO = 'hako' | 'epub' | 'pdf'

export type LocalLibrarySort =
  | ''
  | 'hako_id_asc'
  | 'hako_id_desc'
  | 'title_asc'
  | 'title_desc'
  | 'length_asc'
  | 'length_desc'
  | 'size_asc'
  | 'size_desc'
  | 'last_read_asc'
  | 'last_read_desc'
  | 'last_update_asc'
  | 'last_update_desc'

export type LocalLibrarySourceFilter = 'all' | LocalLibrarySourceDTO

export interface LocalLibraryListItemDTO {
  id: string
  key: string
  title: string
  source: LocalLibrarySourceDTO
  format: 'epub' | 'pdf'
  hasCover: boolean
  sizeKb?: number
  charCount?: number
  pageCount?: number
  numericId: number
  lastReadAt?: string
  lastUpdateAt?: string
  seriesUrl?: string
}

export interface LocalLibraryDetailDTO extends LocalLibraryListItemDTO {
  pdfVersion?: string
  filePath?: string
  canRead?: boolean
  /** Text-only EPUB exists under OFFLINE_EPUB_NOPICTURE_DIR (same basename). */
  hasLiteFile?: boolean
  readingProgress?: BookReadingProgressDTO
}

export interface LocalLibraryTocChapterDTO {
  title: string
  href: string
  slug: string
}

export interface LocalLibraryTocDTO {
  chapters: LocalLibraryTocChapterDTO[]
}

export interface LocalLibraryListResponse {
  items: LocalLibraryListItemDTO[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// AI Quota Types — mỗi "ngày" = 6:00–6:00 Asia/Ho_Chi_Minh
export type CycleRuleType = 'duration' | 'monthly-day' | 'weekly-day' | 'date-range'

export interface DurationCycleRule {
  type: 'duration'
  value: number // số ngày (HCM-day)
  anchorDate?: string // YYYY-MM-DD, mặc định bắt đầu chu kỳ lúc 6:00 sáng
}

export interface MonthlyDayCycleRule {
  type: 'monthly-day'
  dayOfMonth: number // 1-31
}

export interface WeeklyDayCycleRule {
  type: 'weekly-day'
  dayOfWeek: number // 0-6 (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
}

export interface DateRangeCycleRule {
  type: 'date-range'
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}

/** Legacy shapes still readable from MongoDB */
export interface LegacyRollingCycleRule {
  type: 'rolling'
  value: number
  unit?: string
}

export interface LegacyFixedCycleRule {
  type: 'fixed'
  anchor: 'weekly' | 'monthly'
  dayOfWeek?: number
  dayOfMonth?: number
}

export type CycleRule = DurationCycleRule | MonthlyDayCycleRule | WeeklyDayCycleRule | DateRangeCycleRule | LegacyRollingCycleRule | LegacyFixedCycleRule

export interface AiQuotaServiceDocument {
  _id: string
  name: string
  iconUrl: string | null
  cycleRule: CycleRule
  lastResetAt: string
  createdAt: string
  updatedAt: string
  exhausted: boolean
}

export interface AccountDocument {
  _id: string
  name: string
  account: string
  password: string
  logoUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface AccountDTO {
  id: string
  name: string
  account: string
  password: string
  logoUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface AiQuotaServiceDTO {
  id: string
  name: string
  iconUrl: string | null
  cycleRule: CycleRule
  lastResetAt: string
  createdAt: string
  updatedAt: string
  nextResetAt: string
  elapsedMs: number
  remainingMs: number
  statusText: string
  progressPercent: number
  exhausted: boolean
}

export interface DashboardSettingsDTO {
  backgroundImageUrlDark: string | null
  backgroundImageUrlLight: string | null
  backgroundImageUrlMobile: string | null
  backgroundUpdatedAtDark: string | null
  backgroundUpdatedAtLight: string | null
  backgroundUpdatedAtMobile: string | null
  createdAt: string
  updatedAt: string
}

export interface CycleState {
  nextResetAt: string
  prevResetAt: string
  elapsedMs: number
  remainingMs: number
  statusText: string
  progressPercent: number
}
