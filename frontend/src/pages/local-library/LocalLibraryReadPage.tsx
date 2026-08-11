import {
  CloseOutlined,
  LeftOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Alert, message, Spin, Typography } from 'antd'
import JSZip from 'jszip'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/types/src/display/api'
import { fetchLocalLibraryBook, getLocalLibraryFileUrl, updateLocalLibraryLastRead, updateLocalLibraryReadingProgress } from '../../api'
import {
  buildReaderStyleCss,
  chapterLabelFromSpinePath,
  isRelativeAsset,
  mimeForExtension,
  parseEpubSpine,
  READER_BOTTOM_PADDING,
  READER_THEMES,
  requiredZipText,
  resolvePath,
  type ReaderTheme,
} from '../../lib/epub-reader-utils'
import type { LocalLibraryDetailDTO } from '../../types'
import './book-read.css'

type ReaderStatus = 'idle' | 'loading' | 'rendering' | 'ready' | 'error'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const EPUB_READER_SETTINGS_STORAGE_KEY = 'epub-reader-settings'
const DEFAULT_EPUB_READER_SETTINGS = {
  theme: 'parchment' as ReaderTheme,
  fontSize: 18,
  sideMargin: 34,
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

function loadEpubReaderSettings() {
  if (typeof window === 'undefined') return DEFAULT_EPUB_READER_SETTINGS

  try {
    const raw = window.localStorage.getItem(EPUB_READER_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_EPUB_READER_SETTINGS

    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_EPUB_READER_SETTINGS>
    const theme = parsed.theme && parsed.theme in READER_THEMES
      ? parsed.theme
      : DEFAULT_EPUB_READER_SETTINGS.theme

    return {
      theme,
      fontSize: clampNumber(parsed.fontSize, 13, 28, DEFAULT_EPUB_READER_SETTINGS.fontSize),
      sideMargin: clampNumber(parsed.sideMargin, 0, 160, DEFAULT_EPUB_READER_SETTINGS.sideMargin),
    }
  } catch {
    return DEFAULT_EPUB_READER_SETTINGS
  }
}

function saveEpubReaderSettings(theme: ReaderTheme, fontSize: number, sideMargin: number) {
  try {
    window.localStorage.setItem(
      EPUB_READER_SETTINGS_STORAGE_KEY,
      JSON.stringify({ theme, fontSize, sideMargin }),
    )
  } catch {
    // Reader settings are nice-to-have; reading should continue if storage is unavailable.
  }
}

interface Props {
  bookId: string
  onBack: () => void
}

function PdfPage({
  pdfDoc,
  pageNumber,
  rootRef,
  setPageRef,
}: {
  pdfDoc: PDFDocumentProxy
  pageNumber: number
  rootRef: RefObject<HTMLDivElement>
  setPageRef: (index: number, element: HTMLDivElement | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isVisible, setIsVisible] = useState(pageNumber <= 2)
  const [height, setHeight] = useState(980)

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    setPageRef(pageNumber - 1, element)
    return () => setPageRef(pageNumber - 1, null)
  }, [pageNumber, setPageRef])

  useEffect(() => {
    const element = wrapRef.current
    if (!element || isVisible) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { root: rootRef.current, rootMargin: '1400px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [isVisible, rootRef])

  useEffect(() => {
    if (!isVisible) return
    let cancelled = false
    let renderTask: RenderTask | null = null

    async function renderPage() {
      const canvas = canvasRef.current
      const wrapper = wrapRef.current
      if (!canvas || !wrapper) return

      const page = await pdfDoc.getPage(pageNumber)
      if (cancelled) return

      const baseViewport = page.getViewport({ scale: 1 })
      const availableWidth = Math.max(280, Math.min(920, wrapper.clientWidth - 28))
      const scale = availableWidth / baseViewport.width
      const viewport = page.getViewport({ scale })
      const pixelRatio = Math.max(1, window.devicePixelRatio || 1)
      setHeight(viewport.height + 36)

      canvas.width = Math.floor(viewport.width * pixelRatio)
      canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      const task = page.render({ canvas, canvasContext: context, viewport })
      renderTask = task
      await task.promise.catch((err: Error) => {
        if (!cancelled && err?.name !== 'RenderingCancelledException') throw err
      })
    }

    void renderPage()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [isVisible, pageNumber, pdfDoc])

  return (
    <div
      ref={wrapRef}
      className="book-read-pdf-page"
      style={{ minHeight: height }}
      data-page-number={pageNumber}
    >
      <div className="book-read-pdf-page-number">{pageNumber}</div>
      <canvas ref={canvasRef} className="book-read-pdf-canvas" />
    </div>
  )
}

export default function LocalLibraryReadPage({ bookId, onBack }: Props) {
  const [book, setBook] = useState<LocalLibraryDetailDTO | null>(null)
  const [bookError, setBookError] = useState<string | null>(null)
  const [chromeOpen, setChromeOpen] = useState(true)
  const [status, setStatus] = useState<ReaderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [spine, setSpine] = useState<string[]>([])
  const [chapterIndex, setChapterIndex] = useState(0)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [timingText, setTimingText] = useState('')

  const [readerSettings, setReaderSettings] = useState(loadEpubReaderSettings)
  const { theme, fontSize, sideMargin } = readerSettings

  const zipRef = useRef<JSZip | null>(null)
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null)
  const assetUrlsRef = useRef<string[]>([])
  const frameUrlRef = useRef<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const themeRef = useRef(theme)
  const fontSizeRef = useRef(fontSize)
  const sideMarginRef = useRef(sideMargin)
  const currentLocationKeyRef = useRef<string | null>(null)
  const currentChapterPathRef = useRef<string | null>(null)
  const currentSpineIndexRef = useRef(0)
  const saveProgressTimerRef = useRef<number | null>(null)
  const pendingScrollPercentRef = useRef<number | null>(null)
  const pdfContentRef = useRef<HTMLDivElement>(null)
  const pdfPageRefs = useRef<Array<HTMLDivElement | null>>([])
  const lastSavedProgressRef = useRef<string>('')
  const lastReadMarkRef = useRef<string>('')
  const pdfRestoredRef = useRef<string>('')
  const handleKeyDownRef = useRef<(event: KeyboardEvent) => void>(() => {})
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1)

  useEffect(() => { themeRef.current = theme }, [theme])
  useEffect(() => { fontSizeRef.current = fontSize }, [fontSize])
  useEffect(() => { sideMarginRef.current = sideMargin }, [sideMargin])

  useEffect(() => {
    let cancelled = false
    fetchLocalLibraryBook(bookId)
      .then(data => {
        if (!cancelled) setBook(data)
      })
      .catch(err => {
        if (!cancelled) setBookError(err instanceof Error ? err.message : 'Failed to fetch book')
      })
    return () => { cancelled = true }
  }, [bookId])

  const fileUrl = book?.canRead ? getLocalLibraryFileUrl(bookId) : null
  const isEpub = book?.format === 'epub'
  const isPdf = book?.format === 'pdf'
  const epubUrl = isEpub ? fileUrl : null
  const pdfUrl = isPdf ? fileUrl : null
  const savedProgress = book?.readingProgress?.locations.find(progress => progress.locationKey === bookId)
  const isLoading = status === 'loading' || status === 'rendering'

  useEffect(() => {
    if (!book || !book.canRead) return
    const signature = `${bookId}:${book.filePath ?? ''}`
    if (signature === lastReadMarkRef.current) return
    lastReadMarkRef.current = signature

    updateLocalLibraryLastRead(bookId, bookId)
      .then(updated => setBook(updated))
      .catch(() => {
        lastReadMarkRef.current = ''
      })
  }, [book, bookId])

  const revokeReaderUrls = useCallback(() => {
    assetUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    assetUrlsRef.current = []
    if (frameUrlRef.current) {
      URL.revokeObjectURL(frameUrlRef.current)
      frameUrlRef.current = null
    }
    setFrameUrl(null)
  }, [])

  const applyReaderStyle = useCallback(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.head) return
    const id = 'reader-override'
    // Remove all old reader style elements
    doc.head.querySelectorAll(`style#${id}`).forEach(el => el.remove())
    // Create fresh style element
    const el = doc.createElement('style')
    el.id = id
    doc.head.appendChild(el)
    el.textContent = buildReaderStyleCss(themeRef.current, fontSizeRef.current, sideMarginRef.current)
  }, [])

  const getReaderScroll = useCallback(() => {
    if (currentChapterPathRef.current?.startsWith('pdf-page:')) {
      const element = pdfContentRef.current
      if (!element) return null
      const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
      const scrollTop = Math.max(0, element.scrollTop)
      return {
        scrollTop,
        scrollPercent: maxScroll > 0 ? scrollTop / maxScroll : 0,
      }
    }

    const doc = iframeRef.current?.contentDocument
    if (!doc) return null
    const element = doc.scrollingElement ?? doc.documentElement
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
    const scrollTop = Math.max(0, element.scrollTop)
    return {
      scrollTop,
      scrollPercent: maxScroll > 0 ? scrollTop / maxScroll : 0,
    }
  }, [])

  const saveReadingProgress = useCallback(() => {
    const locationKey = currentLocationKeyRef.current
    const chapterPath = currentChapterPathRef.current
    const scroll = getReaderScroll()
    if (!locationKey || !chapterPath || !scroll) return

    const payload = {
      locationKey,
      spineIndex: currentSpineIndexRef.current,
      chapterPath,
      scrollPercent: Math.max(0, Math.min(1, scroll.scrollPercent)),
      scrollTop: scroll.scrollTop,
    }
    const signature = JSON.stringify({
      ...payload,
      scrollPercent: Number(payload.scrollPercent.toFixed(4)),
      scrollTop: Math.round(payload.scrollTop),
    })
    if (signature === lastSavedProgressRef.current) return
    lastSavedProgressRef.current = signature

    updateLocalLibraryReadingProgress(bookId, payload).catch(() => {
      lastSavedProgressRef.current = ''
    })
  }, [bookId, getReaderScroll])

  const scheduleProgressSave = useCallback(() => {
    if (saveProgressTimerRef.current !== null) {
      window.clearTimeout(saveProgressTimerRef.current)
    }
    saveProgressTimerRef.current = window.setTimeout(() => {
      saveProgressTimerRef.current = null
      saveReadingProgress()
    }, 800)
  }, [saveReadingProgress])

  const updatePdfProgress = useCallback(() => {
    const container = pdfContentRef.current
    if (!container) return

    const viewportTop = container.scrollTop
    const viewportBottom = viewportTop + container.clientHeight
    let activeIndex = 0
    let bestVisibleHeight = -1

    for (let index = 0; index < pdfPageRefs.current.length; index += 1) {
      const page = pdfPageRefs.current[index]
      if (!page) continue

      const pageTop = page.offsetTop
      const pageBottom = pageTop + page.offsetHeight
      const visibleHeight = Math.max(
        0,
        Math.min(pageBottom, viewportBottom) - Math.max(pageTop, viewportTop),
      )

      if (visibleHeight > bestVisibleHeight) {
        bestVisibleHeight = visibleHeight
        activeIndex = index
      }
    }

    currentLocationKeyRef.current = bookId
    currentSpineIndexRef.current = activeIndex
    currentChapterPathRef.current = `pdf-page:${activeIndex + 1}`
    setPdfCurrentPage(activeIndex + 1)
  }, [bookId])

  const restorePendingScroll = useCallback(() => {
    const scrollPercent = pendingScrollPercentRef.current
    if (scrollPercent === null) return
    pendingScrollPercentRef.current = null

    window.requestAnimationFrame(() => {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return
      const element = doc.scrollingElement ?? doc.documentElement
      const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
      element.scrollTop = maxScroll * Math.max(0, Math.min(1, scrollPercent))
    })
  }, [])

  const handleFrameLoad = useCallback(() => {
    applyReaderStyle()
    restorePendingScroll()

    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.addEventListener('scroll', scheduleProgressSave, { passive: true })
    win.addEventListener('keydown', (e) => handleKeyDownRef.current(e as any))
  }, [applyReaderStyle, restorePendingScroll, scheduleProgressSave])

  const getBlobUrl = useCallback(async (zip: JSZip, assetPath: string) => {
    const file = zip.file(assetPath)
    if (!file) return null
    const extension = assetPath.split('.').pop()?.toLowerCase() ?? ''
    const data = await file.async('arraybuffer')
    const url = URL.createObjectURL(new Blob([data], { type: mimeForExtension(extension) }))
    assetUrlsRef.current.push(url)
    return url
  }, [])

  const displayChapter = useCallback(
    async (
      zip: JSZip,
      chapterPath: string,
      nextIndex: number,
      total: number,
      restoreScrollPercent?: number,
      options?: { silent?: boolean },
    ) => {
      const startedAt = performance.now()
      const silent = Boolean(options?.silent)
      if (!silent) {
        setStatus('rendering')
        setTimingText('Đang render...')
      }
      currentChapterPathRef.current = chapterPath
      currentSpineIndexRef.current = nextIndex
      pendingScrollPercentRef.current = typeof restoreScrollPercent === 'number' ? restoreScrollPercent : 0

      const dir = chapterPath.includes('/') ? chapterPath.substring(0, chapterPath.lastIndexOf('/') + 1) : ''
      const html = await requiredZipText(zip, chapterPath)
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const tasks: Array<Promise<void>> = []

      doc.querySelectorAll('img, image').forEach(element => {
        const attr = element.hasAttribute('src') ? 'src' : element.hasAttribute('href') ? 'href' : 'xlink:href'
        const src = element.getAttribute(attr)
        if (src && isRelativeAsset(src)) {
          tasks.push(
            getBlobUrl(zip, resolvePath(dir, src)).then(url => {
              if (url) element.setAttribute(attr, url)
            }),
          )
        }
      })

      doc.querySelectorAll('link[rel="stylesheet"]').forEach(element => {
        const href = element.getAttribute('href')
        if (href && isRelativeAsset(href)) {
          tasks.push(
            getBlobUrl(zip, resolvePath(dir, href)).then(url => {
              if (url) element.setAttribute('href', url)
            }),
          )
        }
      })

      await Promise.all(tasks)

      const style = doc.createElement('style')
      // Do not set height:100% — it collapses bottom padding when EPUB CSS uses border-box.
      style.textContent =
        `html,body{height:auto;min-height:100%;}body{margin:0;box-sizing:content-box;padding:28px 34px ${READER_BOTTOM_PADDING};line-height:1.72;font-family:system-ui,'Segoe UI','Noto Sans',Arial,sans-serif;text-align:left!important;word-spacing:normal!important;letter-spacing:normal!important;}img,svg{max-width:100%;height:auto;}p{margin:0 0 1em;text-align:left!important;hyphens:none!important;}`
      doc.head.appendChild(style)

      const nextFrameUrl = URL.createObjectURL(
        new Blob([`<!DOCTYPE html>${doc.documentElement.outerHTML}`], { type: 'text/html;charset=utf-8' }),
      )

      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current)
      frameUrlRef.current = nextFrameUrl
      setFrameUrl(nextFrameUrl)
      setChapterIndex(nextIndex)
      setStatus('ready')
      if (!silent) {
        setTimingText(`${nextIndex + 1}/${total} · ${((performance.now() - startedAt) / 1000).toFixed(2)}s`)
      }
      window.setTimeout(saveReadingProgress, 0)
    },
    [getBlobUrl, saveReadingProgress],
  )

  useEffect(() => {
    if (!pdfUrl || !isPdf) return

    let cancelled = false
    const startedAt = performance.now()
    setStatus('loading')
    setError(null)
    setTimingText('Đang tải PDF...')
    setPdfDoc(null)
    setPdfPageCount(0)
    setPdfCurrentPage(1)
    pdfDocRef.current = null
    pdfPageRefs.current = []
    currentLocationKeyRef.current = bookId
    currentSpineIndexRef.current = Math.max(0, savedProgress?.spineIndex ?? 0)
    currentChapterPathRef.current = `pdf-page:${currentSpineIndexRef.current + 1}`

    const loadingTask = pdfjsLib.getDocument({ url: pdfUrl })
    loadingTask.promise
      .then(doc => {
        if (cancelled) {
          void doc.cleanup()
          return
        }

        pdfDocRef.current = doc
        setPdfDoc(doc)
        setPdfPageCount(doc.numPages)
        setStatus('ready')
        setTimingText(`${doc.numPages} trang · ${((performance.now() - startedAt) / 1000).toFixed(2)}s`)
      })
      .catch(err => {
        if (!cancelled) {
          setStatus('error')
          setError(err instanceof Error ? err.message : 'Không đọc được PDF')
        }
      })

    return () => {
      cancelled = true
      loadingTask.destroy()
      pdfDocRef.current = null
      setPdfDoc(null)
    }
  }, [pdfUrl, isPdf, bookId, savedProgress?.spineIndex])

  useEffect(() => {
    if (!isPdf || !pdfDoc || !pdfContentRef.current) return

    const signature = `${bookId}:${savedProgress?.spineIndex ?? 0}:${savedProgress?.scrollPercent ?? ''}`
    if (pdfRestoredRef.current === signature) return
    pdfRestoredRef.current = signature

    const pageIndex = typeof savedProgress?.spineIndex === 'number'
      ? Math.max(0, Math.min(pdfDoc.numPages - 1, savedProgress.spineIndex))
      : 0
    const target = pdfPageRefs.current[pageIndex]
    window.requestAnimationFrame(() => {
      if (target) {
        target.scrollIntoView({ block: 'start' })
      }
      if (typeof savedProgress?.scrollPercent === 'number') {
        const element = pdfContentRef.current
        if (!element) return
        const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
        element.scrollTop = maxScroll * Math.max(0, Math.min(1, savedProgress.scrollPercent))
      }
      window.setTimeout(updatePdfProgress, 0)
    })
  }, [
    bookId,
    isPdf,
    pdfDoc,
    savedProgress?.scrollPercent,
    savedProgress?.spineIndex,
    updatePdfProgress,
  ])

  useEffect(() => {
    if (!isPdf || !pdfDoc) return
    window.requestAnimationFrame(updatePdfProgress)
  }, [pdfDoc, isPdf, updatePdfProgress])

  useEffect(() => {
    if (!epubUrl || !isEpub || !book) return

    let cancelled = false
    let fullAbort: AbortController | null = null
    const useLite = Boolean(book.hasLiteFile)

    async function fetchEpubBuffer(url: string, signal?: AbortSignal) {
      const response = await fetch(url, { signal })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? `Không tải được EPUB (${response.status})`)
      }
      return response.arrayBuffer()
    }

    async function load() {
      try {
        setStatus('loading')
        setError(null)
        revokeReaderUrls()

        const startedAt = performance.now()
        const liteUrl = useLite ? getLocalLibraryFileUrl(bookId, 'lite') : null
        const fullUrl = getLocalLibraryFileUrl(bookId, 'full')

        setTimingText(useLite ? 'Đang tải bản nhanh...' : 'Đang tải EPUB...')
        let data: ArrayBuffer | null = null
        let loadedLite = false
        if (liteUrl) {
          try {
            data = await fetchEpubBuffer(liteUrl)
            loadedLite = true
          } catch {
            // Lite missing/corrupt — fall through to full.
          }
        }
        if (!data) {
          setTimingText('Đang tải EPUB...')
          data = await fetchEpubBuffer(fullUrl)
          loadedLite = false
        }
        if (cancelled) return

        const { zip, spine: nextSpine } = await parseEpubSpine(data)
        if (cancelled) return

        zipRef.current = zip
        setSpine(nextSpine)
        setTimingText(`Parse ${((performance.now() - startedAt) / 1000).toFixed(2)}s`)
        currentLocationKeyRef.current = bookId

        const savedIndexByPath = savedProgress?.chapterPath
          ? nextSpine.findIndex(item => item === savedProgress.chapterPath)
          : -1
        const savedIndexBySpine = typeof savedProgress?.spineIndex === 'number'
          && savedProgress.spineIndex >= 0
          && savedProgress.spineIndex < nextSpine.length
          ? savedProgress.spineIndex
          : -1
        const initialIndex = savedIndexByPath >= 0
          ? savedIndexByPath
          : savedIndexBySpine >= 0
            ? savedIndexBySpine
            : 0
        await displayChapter(
          zip,
          nextSpine[initialIndex],
          initialIndex,
          nextSpine.length,
          savedProgress?.scrollPercent,
        )

        // Silently upgrade to illustrated EPUB once the lite copy is on screen.
        if (!loadedLite || cancelled) return

        fullAbort = new AbortController()
        void (async () => {
          try {
            const fullData = await fetchEpubBuffer(fullUrl, fullAbort!.signal)
            if (cancelled) return

            const { zip: fullZip, spine: fullSpine } = await parseEpubSpine(fullData)
            if (cancelled) return

            const scroll = getReaderScroll()?.scrollPercent
            const chapterPath = currentChapterPathRef.current
            const spineIndex = currentSpineIndexRef.current
            const nextIndexByPath = chapterPath
              ? fullSpine.findIndex(item => item === chapterPath)
              : -1
            const nextIndex = nextIndexByPath >= 0
              ? nextIndexByPath
              : Math.max(0, Math.min(fullSpine.length - 1, spineIndex))

            zipRef.current = fullZip
            setSpine(fullSpine)
            await displayChapter(
              fullZip,
              fullSpine[nextIndex],
              nextIndex,
              fullSpine.length,
              scroll ?? undefined,
              { silent: true },
            )
          } catch (err) {
            if (cancelled) return
            if (err instanceof DOMException && err.name === 'AbortError') return
            // Keep lite copy — full download is best-effort.
          }
        })()
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setError(err instanceof Error ? err.message : 'Không đọc được EPUB')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
      fullAbort?.abort()
    }
  }, [
    book,
    displayChapter,
    epubUrl,
    getReaderScroll,
    isEpub,
    bookId,
    revokeReaderUrls,
    savedProgress?.chapterPath,
    savedProgress?.scrollPercent,
    savedProgress?.spineIndex,
  ])

  useEffect(() => () => revokeReaderUrls(), [revokeReaderUrls])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  function changeTheme(next: ReaderTheme) {
    themeRef.current = next
    setReaderSettings(current => {
      const updated = { ...current, theme: next }
      saveEpubReaderSettings(updated.theme, updated.fontSize, updated.sideMargin)
      return updated
    })
    applyReaderStyle()
  }

  function changeFontSize(delta: number) {
    const next = Math.max(13, Math.min(28, fontSizeRef.current + delta))
    fontSizeRef.current = next
    setReaderSettings(current => {
      const updated = { ...current, fontSize: next }
      saveEpubReaderSettings(updated.theme, updated.fontSize, updated.sideMargin)
      return updated
    })
    applyReaderStyle()
  }

  function changeSideMargin(delta: number) {
    const next = Math.max(0, Math.min(160, sideMarginRef.current + delta))
    sideMarginRef.current = next
    setReaderSettings(current => {
      const updated = { ...current, sideMargin: next }
      saveEpubReaderSettings(updated.theme, updated.fontSize, updated.sideMargin)
      return updated
    })
    applyReaderStyle()
  }

  const setPdfPageRef = useCallback((index: number, element: HTMLDivElement | null) => {
    pdfPageRefs.current[index] = element
  }, [])

  async function goToChapter(nextIndex: number) {
    const zip = zipRef.current
    const chapterPath = spine[nextIndex]
    if (!zip || !chapterPath) return
    saveReadingProgress()
    await displayChapter(zip, chapterPath, nextIndex, spine.length)
  }

  function goToPdfPage(pageNumber: number) {
    if (!pdfDoc) return
    const nextPage = Math.max(1, Math.min(pdfDoc.numPages, pageNumber))
    const page = pdfPageRefs.current[nextPage - 1]
    if (!page) return

    page.scrollIntoView({ block: 'start' })
    currentSpineIndexRef.current = nextPage - 1
    currentChapterPathRef.current = `pdf-page:${nextPage}`
    setPdfCurrentPage(nextPage)
    window.setTimeout(saveReadingProgress, 0)
  }

  useEffect(() => {
    handleKeyDownRef.current = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      
      const target = event.target as any
      if (
        target?.isContentEditable
        || target?.tagName === 'INPUT'
        || target?.tagName === 'TEXTAREA'
        || target?.tagName === 'SELECT'
      ) {
        return
      }

      if (isLoading) return

      if (event.key === 'ArrowLeft') {
        if (isPdf) {
          if (pdfCurrentPage <= 1) return
          event.preventDefault()
          goToPdfPage(pdfCurrentPage - 1)
        } else if (isEpub) {
          if (chapterIndex === 0) return
          event.preventDefault()
          void goToChapter(chapterIndex - 1)
        }
        return
      }

      if (isPdf) {
        if (pdfCurrentPage >= pdfPageCount) return
        event.preventDefault()
        goToPdfPage(pdfCurrentPage + 1)
      } else if (isEpub) {
        if (chapterIndex >= spine.length - 1) return
        event.preventDefault()
        void goToChapter(chapterIndex + 1)
      }
    }
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => handleKeyDownRef.current(e)
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (bookError) {
    return (
      <div className="book-read-root">
        <Alert className="book-read-alert" type="error" showIcon message={bookError} />
        <button type="button" className="book-read-toolbar-btn" onClick={onBack}>
          <CloseOutlined />
        </button>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="book-read-root">
        <div className="book-read-loading">
          <Spin size="large" />
          <Typography.Text type="secondary">Đang tải thông tin sách...</Typography.Text>
        </div>
      </div>
    )
  }

  return (
    <div className="book-read-root">
      {chromeOpen ? (
        <div className="book-read-toolbar">
          <button
            type="button"
            className="book-read-toolbar-btn"
            title="Ẩn thanh điều khiển"
            onClick={() => setChromeOpen(false)}
          >
            <MenuOutlined />
          </button>

          <span className="book-read-toolbar-divider" />

          <button
            type="button"
            className="book-read-toolbar-btn"
            disabled={
              isPdf
                ? pdfCurrentPage <= 1 || isLoading
                : !isEpub || chapterIndex === 0 || isLoading
            }
            onClick={() => {
              if (isPdf) goToPdfPage(pdfCurrentPage - 1)
              else void goToChapter(chapterIndex - 1)
            }}
          >
            <LeftOutlined />
          </button>

          <span className="book-read-toolbar-chapter">
            {isPdf
              ? `${pdfCurrentPage}/${pdfPageCount || '—'}`
              : spine.length ? `${chapterIndex + 1}/${spine.length}` : '—'}
          </span>

          <button
            type="button"
            className="book-read-toolbar-btn"
            disabled={
              isPdf
                ? pdfCurrentPage >= pdfPageCount || isLoading
                : !isEpub || chapterIndex >= spine.length - 1 || isLoading
            }
            onClick={() => {
              if (isPdf) goToPdfPage(pdfCurrentPage + 1)
              else void goToChapter(chapterIndex + 1)
            }}
          >
            <RightOutlined />
          </button>

          <span className="book-read-toolbar-divider" />

          <button
            type="button"
            className="book-read-toolbar-btn book-read-font-btn small"
            disabled={!isEpub || fontSize <= 13 || isLoading}
            onClick={() => changeFontSize(-1)}
          >
            A−
          </button>
          <span className="book-read-toolbar-label">{fontSize}</span>
          <button
            type="button"
            className="book-read-toolbar-btn book-read-font-btn large"
            disabled={!isEpub || fontSize >= 28 || isLoading}
            onClick={() => changeFontSize(1)}
          >
            A+
          </button>

          <span className="book-read-toolbar-divider" />

          <button
            type="button"
            className="book-read-toolbar-btn"
            title="Giảm lề ngang"
            disabled={!isEpub || sideMargin <= 0 || isLoading}
            onClick={() => changeSideMargin(-8)}
          >
            <MenuUnfoldOutlined />
          </button>
          <span className="book-read-toolbar-label" style={{ minWidth: 34 }}>{sideMargin}</span>
          <button
            type="button"
            className="book-read-toolbar-btn"
            title="Tăng lề ngang"
            disabled={!isEpub || sideMargin >= 160 || isLoading}
            onClick={() => changeSideMargin(8)}
          >
            <MenuFoldOutlined />
          </button>

          <span className="book-read-toolbar-divider" />

          {(Object.keys(READER_THEMES) as ReaderTheme[]).map(key => (
            <button
              key={key}
              type="button"
              title={READER_THEMES[key].label}
              className={`book-read-theme-dot${theme === key ? ' is-active' : ''}`}
              style={{ background: READER_THEMES[key].bg }}
              onClick={() => changeTheme(key)}
            />
          ))}

          <span className="book-read-toolbar-title">{book.title}</span>
          <span className="book-read-toolbar-meta">{timingText}</span>

          <button type="button" className="book-read-toolbar-btn" onClick={onBack} title="Đóng">
            <CloseOutlined />
          </button>
        </div>
      ) : null}

      <div className="book-read-body">
        {!chromeOpen ? (
          <button
            type="button"
            className="book-read-floating-toggle"
            title="Mở điều khiển"
            onClick={() => setChromeOpen(true)}
          >
            <MenuOutlined />
          </button>
        ) : null}

        {chromeOpen && isEpub ? (
          <>
            <button
              type="button"
              className="book-read-sidebar-backdrop"
              aria-label="Ẩn thanh điều khiển"
              onClick={() => setChromeOpen(false)}
            />
            <aside className="book-read-sidebar">
              {spine.map((chapterPath, index) => (
                <button
                  key={chapterPath}
                  type="button"
                  className={`book-read-chapter-item${index === chapterIndex ? ' is-active' : ''}`}
                  disabled={isLoading}
                  title={chapterPath}
                  onClick={() => {
                    void goToChapter(index)
                    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
                      setChromeOpen(false)
                    }
                  }}
                >
                  {chapterLabelFromSpinePath(chapterPath)}
                </button>
              ))}
              {!spine.length ? (
                <Typography.Text type="secondary" style={{ display: 'block', padding: '12px 16px', fontSize: 12 }}>
                  {status === 'loading' ? 'Đang tải...' : '—'}
                </Typography.Text>
              ) : null}
            </aside>
          </>
        ) : null}

        <div className="book-read-content">
          {!book?.canRead ? (
            <Alert
              className="book-read-alert"
              type="warning"
              showIcon
              message="Không tìm thấy file sách có đường dẫn đọc được."
            />
          ) : null}

          {status === 'error' ? (
            <Alert className="book-read-alert" type="error" showIcon message={error} />
          ) : null}

          {status === 'loading' && !frameUrl ? (
            <div className="book-read-loading" style={{ background: READER_THEMES[theme].bg }}>
              <Spin size="large" />
              <Typography.Text type="secondary">Đang tải sách...</Typography.Text>
            </div>
          ) : null}

          {pdfDoc && isPdf ? (
            <div ref={pdfContentRef} className="book-read-pdf-scroll" onScroll={updatePdfProgress}>
              <div className="book-read-pdf-stack">
                {Array.from({ length: pdfDoc.numPages }, (_, index) => (
                  <PdfPage
                    key={index + 1}
                    pdfDoc={pdfDoc}
                    pageNumber={index + 1}
                    rootRef={pdfContentRef}
                    setPageRef={setPdfPageRef}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {frameUrl && isEpub ? (
            <iframe
              ref={iframeRef}
              className="book-read-frame"
              src={frameUrl}
              title={book.title}
              sandbox="allow-same-origin allow-scripts"
              onLoad={handleFrameLoad}
              style={{ backgroundColor: READER_THEMES[theme].bg }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
