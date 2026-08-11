export interface TrackDTO {
  id: string
  filename: string
  dateModified: string
  duration: number
  format: string
  artist?: string
  album?: string
  hasCover: boolean
}

export type SortField = 'dateModified' | 'filename' | 'duration'
export type SortOrder = 'asc' | 'desc'
export type LibraryDateFilterMode = 'default' | 'month' | 'monthAllYears' | 'last30'

export interface LibraryPageResponse {
  items: TrackDTO[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

export interface FetchLibraryParams {
  limit?: number
  offset?: number
  sort?: SortField
  order?: SortOrder
  search?: string
  filter?: LibraryDateFilterMode
  month?: string
}

export interface WatchlistItemDTO {
  id: string
  videoId: string
  url: string
  title: string
  thumbnailUrl: string
  savedAt: string
}

export interface JournalAttachmentDTO {
  originalUrl: string
  url: string
  fileName: string
  contentType?: string
  sizeBytes?: number
}

export interface JournalMessageDTO {
  id: string
  messageId: string
  author: string
  timestamp: string
  content: string
  attachments: JournalAttachmentDTO[]
  hasAttachments: boolean
  pinned?: boolean
  pinnedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface JournalListResponse {
  items: JournalMessageDTO[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface JournalDayDTO {
  day: string
  count: number
}

export interface JournalDaysResponse {
  items: JournalDayDTO[]
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

export type LocalLibrarySource = 'hako' | 'epub' | 'pdf'
export type LocalLibrarySourceFilter = 'all' | LocalLibrarySource

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

export interface LocalLibraryListItemDTO {
  id: string
  key: string
  title: string
  source: LocalLibrarySource
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

export interface LocalLibraryListResponse {
  items: LocalLibraryListItemDTO[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface LocalLibraryDetailDTO extends LocalLibraryListItemDTO {
  pdfVersion?: string
  filePath?: string
  canRead?: boolean
  /** Text-only EPUB available for fast first paint (progressive load). */
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

export type CycleRule = DurationCycleRule | MonthlyDayCycleRule | WeeklyDayCycleRule | DateRangeCycleRule

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

export interface AccountDTO {
  id: string
  name: string
  account: string
  password: string
  logoUrl: string | null
  createdAt: string
  updatedAt: string
}

export type DashboardBackgroundTheme = 'dark' | 'light' | 'mobile'

/** Fixed API paths — files live in backend/data/dashboard-backgrounds/{theme}.png */
export const DASHBOARD_BACKGROUND_URLS: Record<DashboardBackgroundTheme, string> = {
  dark: '/api/dashboard/background/dark.png',
  light: '/api/dashboard/background/light.png',
  mobile: '/api/dashboard/background/mobile.png',
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

export type OpsProbeDTO = {
  label: string
  url: string
  online: boolean
  status: number | null
  latencyMs: number | null
  error?: string
}

export type OpsServiceDTO = {
  id: string
  name: string
  description: string
  canStart: boolean
  canStop: boolean
  canDeploy: boolean
  busy: 'start' | 'stop' | 'deploy' | null
  open: string | null
  health: {
    probed: boolean
    online: boolean
    allOnline: boolean
    probes: OpsProbeDTO[]
  }
}

export type OpsActionResult = {
  ok: boolean
  id: string
  action: string
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  async?: boolean
  error?: string
}

