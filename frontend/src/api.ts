import type {
  TrackDTO,
  WatchlistItemDTO,
  JournalDaysResponse,
  JournalListResponse,
  JournalMessageDTO,
  LocalLibraryListResponse,
  LocalLibrarySort,
  LocalLibrarySourceFilter,
  LocalLibraryDetailDTO,
  LocalLibraryTocDTO,
  AiQuotaServiceDTO,
  AccountDTO,
  CycleRule,
  DashboardSettingsDTO,
  DashboardBackgroundTheme,
  FetchLibraryParams,
  LibraryPageResponse,
  OpsServiceDTO,
  OpsActionResult,
} from './types'

function buildLibraryQuery(params?: FetchLibraryParams): string {
  if (!params) return ''
  const query = new URLSearchParams()
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.offset !== undefined) query.set('offset', String(params.offset))
  if (params.sort) query.set('sort', params.sort)
  if (params.order) query.set('order', params.order)
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.filter) query.set('filter', params.filter)
  if (params.month) query.set('month', params.month)
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

export async function fetchLibrary(): Promise<TrackDTO[]> {
  const res = await fetch('/api/library')
  if (!res.ok) throw new Error('Failed to fetch library')
  return res.json()
}

export async function fetchLibraryPage(params: FetchLibraryParams): Promise<LibraryPageResponse> {
  const res = await fetch(`/api/library${buildLibraryQuery(params)}`)
  if (!res.ok) throw new Error('Failed to fetch library page')
  return res.json()
}

export async function rescanLibrary(): Promise<TrackDTO[]> {
  const res = await fetch('/api/library/scan', { method: 'POST' })
  if (!res.ok) throw new Error('Failed to rescan')
  return res.json()
}

export function downloadYoutube(
  url: string,
  onLog: (line: string) => void,
  onDone: (msg: string, track?: TrackDTO) => void,
  onError: (msg: string) => void,
): void {
  const evtSource = new EventSource(`/api/ytdlp/download?url=${encodeURIComponent(url)}`)
  let downloadedTrack: TrackDTO | undefined

  evtSource.onmessage = (e: MessageEvent) => {
    const msg = JSON.parse(e.data) as { type: string; data: string }
    if (msg.type === 'log') {
      onLog(msg.data)
    } else if (msg.type === 'track') {
      try {
        downloadedTrack = JSON.parse(msg.data) as TrackDTO
      } catch {
        downloadedTrack = undefined
      }
    } else if (msg.type === 'done') {
      evtSource.close()
      onDone(msg.data, downloadedTrack)
    } else if (msg.type === 'error') {
      evtSource.close()
      onError(msg.data)
    }
  }

  evtSource.onerror = () => {
    evtSource.close()
    onError('Mất kết nối với server')
  }
}

export function renameTrack(id: string, newFilename: string): Promise<Response> {
  return fetch(`/api/library/${id}/rename`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newFilename }),
  })
}

export function updateCover(id: string, imageFile: File): Promise<Response> {
  const form = new FormData()
  form.append('image', imageFile)
  return fetch(`/api/library/${id}/cover`, { method: 'POST', body: form })
}

export function updateArtist(id: string, artist: string): Promise<Response> {
  return fetch(`/api/library/${id}/artist`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist }),
  })
}

export function updateDateModified(id: string, dateModified: string): Promise<Response> {
  return fetch(`/api/library/${id}/dateModified`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateModified }),
  })
}

export function trimTrack(id: string, startSec: number, endSec: number): Promise<Response> {
  return fetch(`/api/library/${id}/trim`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startSec, endSec }),
  })
}

export async function deleteTrack(id: string): Promise<void> {
  const res = await fetch(`/api/library/${id}`, { method: "DELETE" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "Failed to delete track")
  }
}

export async function fetchDashboardSettings(): Promise<DashboardSettingsDTO> {
  const res = await fetch('/api/dashboard')
  if (!res.ok) throw new Error('Failed to fetch dashboard settings')
  return res.json()
}

export async function updateDashboardBackground(
  theme: DashboardBackgroundTheme,
  image: File,
): Promise<DashboardSettingsDTO> {
  const form = new FormData()
  form.append('image', image, image.name)
  const res = await fetch(`/api/dashboard/background/${theme}`, {
    method: 'PUT',
    body: form,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to update dashboard background')
  }
  return res.json()
}

export async function clearDashboardBackground(theme: DashboardBackgroundTheme): Promise<DashboardSettingsDTO> {
  const res = await fetch(`/api/dashboard/background/${theme}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to clear dashboard background')
  }
  return res.json()
}


export async function fetchWatchlist(): Promise<WatchlistItemDTO[]> {
  const res = await fetch('/api/watchlist')
  if (!res.ok) throw new Error('Failed to fetch watchlist')
  return res.json()
}

export async function saveWatchlistItem(url: string): Promise<WatchlistItemDTO> {
  const res = await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to save watchlist item')
  }
  return res.json()
}

export async function deleteWatchlistItem(id: string): Promise<void> {
  const res = await fetch(`/api/watchlist/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete watchlist item')
}

export async function fetchJournalMessages(params: {
  q?: string
  day?: string | null
  after?: string | null
  before?: string | null
  month?: string | null
  page?: number
  limit?: number
} = {}): Promise<JournalListResponse> {
  const search = new URLSearchParams()
  search.set('page', String(params.page ?? 1))
  search.set('limit', String(params.limit ?? 50))
  if (params.q?.trim()) search.set('q', params.q.trim())
  if (params.day) search.set('day', params.day)
  if (params.after) search.set('after', params.after)
  if (params.before) search.set('before', params.before)
  if (params.month) search.set('month', params.month)

  const res = await fetch(`/api/journal/messages?${search.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch journal messages')
  return res.json()
}

export async function fetchJournalDays(): Promise<JournalDaysResponse> {
  const res = await fetch('/api/journal/days')
  if (!res.ok) throw new Error('Failed to fetch journal days')
  return res.json()
}

export async function createJournalMessage(input: {
  content?: string
  author?: string
  timestamp?: string
  images?: File[]
}): Promise<JournalMessageDTO> {
  const hasImages = Boolean(input.images?.length)
  const res = hasImages
    ? await fetch('/api/journal/messages', {
      method: 'POST',
      body: (() => {
        const form = new FormData()
        if (input.content) form.append('content', input.content)
        if (input.author) form.append('author', input.author)
        if (input.timestamp) form.append('timestamp', input.timestamp)
        for (const image of input.images ?? []) form.append('images', image, image.name)
        return form
      })(),
    })
    : await fetch('/api/journal/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to create journal message')
  }
  return res.json()
}

export async function updateJournalMessage(
  id: string,
  input: {
    content?: string
    author?: string
    timestamp?: string
    images?: File[]
    removeAttachments?: string[]
  },
): Promise<JournalMessageDTO> {
  const hasImages = Boolean(input.images?.length)
  const hasRemovals = Boolean(input.removeAttachments?.length)

  const res = hasImages || hasRemovals
    ? await fetch(`/api/journal/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: (() => {
        const form = new FormData()
        if (input.content !== undefined) form.append('content', input.content)
        if (input.author) form.append('author', input.author)
        if (input.timestamp) form.append('timestamp', input.timestamp)
        if (hasRemovals) form.append('removeAttachments', JSON.stringify(input.removeAttachments))
        for (const image of input.images ?? []) form.append('images', image, image.name)
        return form
      })(),
    })
    : await fetch(`/api/journal/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to update journal message')
  }
  return res.json()
}

export async function deleteJournalMessage(id: string): Promise<void> {
  const res = await fetch(`/api/journal/messages/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete journal message')
}

export async function fetchPinnedJournalMessages(): Promise<{ items: JournalMessageDTO[] }> {
  const res = await fetch('/api/journal/messages/pinned')
  if (!res.ok) throw new Error('Failed to fetch pinned journal messages')
  return res.json()
}

export async function pinJournalMessage(id: string): Promise<JournalMessageDTO> {
  const res = await fetch(`/api/journal/messages/${encodeURIComponent(id)}/pin`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to pin journal message')
  }
  return res.json()
}

export async function unpinJournalMessage(id: string): Promise<JournalMessageDTO> {
  const res = await fetch(`/api/journal/messages/${encodeURIComponent(id)}/pin`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to unpin journal message')
  }
  return res.json()
}

export async function fetchJournalYoutubeMetadata(url: string): Promise<{
  videoId: string
  title: string
  url: string
  thumbnailUrl: string
}> {
  const res = await fetch('/api/journal/youtube-metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to fetch YouTube metadata')
  }
  return res.json()
}

export async function fetchLocalLibrary(params: {
  q?: string
  page?: number
  limit?: number
  sort?: LocalLibrarySort
  source?: LocalLibrarySourceFilter
} = {}): Promise<LocalLibraryListResponse> {
  const search = new URLSearchParams()
  search.set('limit', String(params.limit ?? 48))
  search.set('page', String(params.page ?? 1))
  if (params.q?.trim()) search.set('q', params.q.trim())
  if (params.sort?.trim()) search.set('sort', params.sort.trim())
  if (params.source && params.source !== 'all') {
    search.set('source', params.source)
  }

  const res = await fetch(`/api/local-library?${search.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch local library')
  return res.json()
}

export function getLocalLibraryCoverUrl(book: { id: string; hasCover: boolean }): string | null {
  if (!book.hasCover) return null
  return `/api/local-library/cover/${encodeURIComponent(book.id)}`
}

export async function fetchLocalLibraryBook(id: string): Promise<LocalLibraryDetailDTO> {
  const res = await fetch(`/api/local-library/${encodeURIComponent(id)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to fetch book')
  }
  return res.json()
}

export async function fetchLocalLibraryBookToc(id: string): Promise<LocalLibraryTocDTO> {
  const res = await fetch(`/api/local-library/${encodeURIComponent(id)}/toc`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to fetch book table of contents')
  }
  return res.json()
}

export function getLocalLibraryFileUrl(
  id: string,
  variant: 'full' | 'lite' = 'full',
  options?: { download?: boolean },
) {
  const base = `/api/local-library/${encodeURIComponent(id)}/file`
  const params = new URLSearchParams()
  if (variant === 'lite') params.set('variant', 'lite')
  if (options?.download) params.set('download', '1')
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export async function openLocalLibraryFolder(folderPath: string): Promise<void> {
  const res = await fetch('/api/local-library/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to open folder')
  }
}

export async function updateLocalLibraryReadingProgress(
  id: string,
  progress: {
    locationKey: string
    spineIndex?: number
    chapterPath?: string
    scrollPercent?: number
    scrollTop?: number
  },
): Promise<LocalLibraryDetailDTO> {
  const res = await fetch(`/api/local-library/${encodeURIComponent(id)}/progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to update reading progress')
  }

  return res.json()
}

export async function updateLocalLibraryLastRead(
  id: string,
  locationKey?: string,
): Promise<LocalLibraryDetailDTO> {
  const res = await fetch(`/api/local-library/${encodeURIComponent(id)}/last-read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locationKey }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to update last read time')
  }

  return res.json()
}

export async function clearLocalLibraryLastRead(id: string): Promise<LocalLibraryDetailDTO> {
  const res = await fetch(`/api/local-library/${encodeURIComponent(id)}/last-read`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to clear last read')
  }

  return res.json()
}

export async function importLocalLibraryBook(bookFile: File): Promise<LocalLibraryDetailDTO> {
  const body = new FormData()
  body.append('book', bookFile)
  body.append('lastModified', String(bookFile.lastModified))

  const res = await fetch('/api/local-library/import', {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error ?? 'Failed to import book')
  }

  return res.json()
}

export async function updateLocalLibraryBook(
  id: string,
  input: { title?: string; coverFile?: File },
): Promise<LocalLibraryDetailDTO> {
  const body = new FormData()
  if (typeof input.title === 'string') body.append('title', input.title)
  if (input.coverFile) body.append('cover', input.coverFile)

  const res = await fetch(`/api/local-library/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error ?? 'Failed to update book')
  }

  return res.json()
}

export async function deleteLocalLibraryBook(id: string): Promise<void> {
  const res = await fetch(`/api/local-library/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    throw new Error(payload.error ?? 'Failed to delete book')
  }
}

// AI Quota API functions
export async function fetchAiQuotaServices(): Promise<AiQuotaServiceDTO[]> {
  const res = await fetch('/api/ai-quota')
  if (!res.ok) throw new Error('Failed to fetch AI quota services')
  return res.json()
}

export async function fetchAiQuotaService(id: string): Promise<AiQuotaServiceDTO> {
  const res = await fetch(`/api/ai-quota/${encodeURIComponent(id)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to fetch AI quota service')
  }
  return res.json()
}

export async function createAiQuotaService(input: {
  name: string
  cycleRule: CycleRule
  icon?: File
}): Promise<AiQuotaServiceDTO> {
  const hasIcon = Boolean(input.icon)
  const res = hasIcon
    ? await fetch('/api/ai-quota', {
        method: 'POST',
        body: (() => {
          const form = new FormData()
          form.append('name', input.name)
          form.append('cycleRule', JSON.stringify(input.cycleRule))
          if (input.icon) form.append('icon', input.icon, input.icon.name)
          return form
        })(),
      })
    : await fetch('/api/ai-quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to create AI quota service')
  }
  return res.json()
}

export async function updateAiQuotaService(
  id: string,
  input: {
    name?: string
    cycleRule?: CycleRule
    icon?: File
  },
): Promise<AiQuotaServiceDTO> {
  const hasIcon = Boolean(input.icon)
  const res = hasIcon
    ? await fetch(`/api/ai-quota/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: (() => {
          const form = new FormData()
          if (input.name !== undefined) form.append('name', input.name)
          if (input.cycleRule !== undefined) form.append('cycleRule', JSON.stringify(input.cycleRule))
          if (input.icon) form.append('icon', input.icon, input.icon.name)
          return form
        })(),
      })
    : await fetch(`/api/ai-quota/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to update AI quota service')
  }
  return res.json()
}

export async function deleteAiQuotaService(id: string): Promise<void> {
  const res = await fetch(`/api/ai-quota/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete AI quota service')
}

export async function resetAiQuotaService(id: string): Promise<AiQuotaServiceDTO> {
  const res = await fetch(`/api/ai-quota/${encodeURIComponent(id)}/reset`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to reset AI quota service')
  }
  return res.json()
}

export async function toggleAiQuotaServiceExhausted(id: string, exhausted: boolean): Promise<AiQuotaServiceDTO> {
  const res = await fetch(`/api/ai-quota/${encodeURIComponent(id)}/exhausted`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exhausted }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to toggle exhausted status')
  }
  return res.json()
}

// Accounts API
export async function fetchAccounts(): Promise<AccountDTO[]> {
  const res = await fetch('/api/accounts')
  if (!res.ok) throw new Error('Failed to fetch accounts')
  return res.json()
}

export async function createAccount(input: {
  name: string
  account: string
  password: string
  logo?: File
}): Promise<AccountDTO> {
  const hasLogo = Boolean(input.logo)
  const res = hasLogo
    ? await fetch('/api/accounts', {
        method: 'POST',
        body: (() => {
          const form = new FormData()
          form.append('name', input.name)
          form.append('account', input.account)
          form.append('password', input.password)
          if (input.logo) form.append('logo', input.logo, input.logo.name)
          return form
        })(),
      })
    : await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          account: input.account,
          password: input.password,
        }),
      })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to create account')
  }
  return res.json()
}

export async function updateAccount(
  id: string,
  input: {
    name?: string
    account?: string
    password?: string
    logo?: File
  },
): Promise<AccountDTO> {
  const hasLogo = Boolean(input.logo)
  const res = hasLogo
    ? await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: (() => {
          const form = new FormData()
          if (input.name !== undefined) form.append('name', input.name)
          if (input.account !== undefined) form.append('account', input.account)
          if (input.password !== undefined) form.append('password', input.password)
          if (input.logo) form.append('logo', input.logo, input.logo.name)
          return form
        })(),
      })
    : await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? 'Failed to update account')
  }
  return res.json()
}

export async function deleteAccount(id: string): Promise<void> {
  const res = await fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete account')
}

export async function fetchOpsServices(): Promise<OpsServiceDTO[]> {
  const res = await fetch('/api/services')
  if (!res.ok) throw new Error('Failed to fetch services')
  const data = await res.json()
  return data.services as OpsServiceDTO[]
}

export async function checkOpsServices(): Promise<OpsServiceDTO[]> {
  const res = await fetch('/api/services/check', { method: 'POST' })
  if (!res.ok) throw new Error('Failed to check services')
  const data = await res.json()
  return data.services as OpsServiceDTO[]
}

export async function checkOpsService(id: string): Promise<OpsServiceDTO> {
  const res = await fetch(`/api/services/${encodeURIComponent(id)}/check`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to check service')
  return res.json()
}

export async function startOpsService(id: string): Promise<OpsActionResult> {
  const res = await fetch(`/api/services/${encodeURIComponent(id)}/start`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Start failed')
  return data as OpsActionResult
}

export async function stopOpsService(id: string): Promise<OpsActionResult> {
  const res = await fetch(`/api/services/${encodeURIComponent(id)}/stop`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Stop failed')
  return data as OpsActionResult
}

export async function deployOpsService(id: string): Promise<OpsActionResult> {
  const res = await fetch(`/api/services/${encodeURIComponent(id)}/deploy`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Deploy failed')
  return data as OpsActionResult
}

