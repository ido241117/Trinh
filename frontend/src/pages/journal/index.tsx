import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ClipboardEvent,
  type MouseEvent,
  type UIEvent,
} from 'react'
import {
  BoldOutlined,
  CloseOutlined,
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileOutlined,
  ItalicOutlined,
  MenuOutlined,
  OrderedListOutlined,
  PaperClipOutlined,
  PlayCircleFilled,
  PlusOutlined,
  PushpinFilled,
  PushpinOutlined,
  SearchOutlined,
  SendOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Alert, Button, DatePicker, Drawer, Dropdown, Empty, Image, Input, List, Modal, Popconfirm, Spin, Typography, message } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import type { MenuProps } from 'antd'
import type { Dayjs } from 'dayjs'
import {
  createJournalMessage,
  deleteJournalMessage,
  fetchJournalMessages,
  fetchJournalYoutubeMetadata,
  fetchLibrary,
  fetchPinnedJournalMessages,
  pinJournalMessage,
  unpinJournalMessage,
  updateJournalMessage,
} from '../../api'
import type { JournalMessageDTO, TrackDTO } from '../../types'
import { JournalMessageBody } from './JournalMessageBody'
import JournalMusicCard from './JournalMusicCard'
import {
  buildJournalTimeline,
  filterJournalMusicByDate,
  filterJournalMusicByLoadedWindow,
  filterJournalMusicTracks,
  type JournalTimelineItem,
} from './journalMusic'
import { JournalLocationForm } from './JournalLocationForm'
import {
  buildJournalContent,
  parseJournalLocationInput,
  splitJournalContent,
  type JournalLocation,
  type JournalYoutubeLink,
} from './journalLocation'
import './journal.css'

const PAGE_SIZE = 50
const FILTER_PAGE_SIZE = 3000
const COMPOSER_MAX_HEIGHT = 148
const JOURNAL_BATCH_WINDOW_MS = 60 * 60 * 1000
const JOURNAL_COMPOSER_DRAFT_STORAGE_KEY = 'journal-composer-draft'
const JOURNAL_COMPOSER_DRAFT_SAVE_DELAY_MS = 300
const JOURNAL_PRIVACY_MODE_STORAGE_KEY = 'journal-privacy-mode-enabled'

type MarkdownFormat =
  | 'bold'
  | 'italic'
  | 'boldItalic'
  | 'underline'
  | 'strike'
  | 'inlineCode'
  | 'codeBlock'
  | 'h1'
  | 'h2'
  | 'quote'
  | 'unorderedList'
  | 'orderedList'

interface FormatMenuPosition {
  left: number
  top: number
  placement: 'above' | 'below'
}

const markdownFormatOptions: Array<{
  format: MarkdownFormat
  label: string
  icon: JSX.Element
}> = [
  { format: 'bold', label: 'Bold', icon: <BoldOutlined /> },
  { format: 'italic', label: 'Italic', icon: <ItalicOutlined /> },
  { format: 'boldItalic', label: 'Bold italic', icon: <BoldOutlined /> },
  { format: 'underline', label: 'Underline', icon: <UnderlineOutlined /> },
  { format: 'strike', label: 'Strike', icon: <StrikethroughOutlined /> },
  { format: 'inlineCode', label: 'Inline code', icon: <CodeOutlined /> },
  { format: 'codeBlock', label: 'Code block', icon: <CodeOutlined /> },
  { format: 'h1', label: 'H1', icon: <span aria-hidden>H1</span> },
  { format: 'h2', label: 'H2', icon: <span aria-hidden>H2</span> },
  { format: 'quote', label: 'Quote', icon: <span aria-hidden>&gt;</span> },
  { format: 'unorderedList', label: 'Bullet list', icon: <UnorderedListOutlined /> },
  { format: 'orderedList', label: 'Number list', icon: <OrderedListOutlined /> },
]

type ComposerAttachAction = 'image' | 'location' | 'youtube'

const composerAttachOptions: Array<{
  action: ComposerAttachAction
  label: string
  icon: JSX.Element
}> = [
  { action: 'image', label: 'Attach picture', icon: <PaperClipOutlined /> },
  { action: 'location', label: 'Location', icon: <EnvironmentOutlined /> },
  { action: 'youtube', label: 'YouTube link', icon: <PlayCircleFilled /> },
]

interface PendingImagePreview {
  file: File
  url: string
}

const JOURNAL_FILTER_DATE_PICKER_PROPS = {
  placement: 'bottomLeft' as const,
  getPopupContainer: () => document.body,
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  })
}

function readStoredComposerDraft() {
  try {
    return window.localStorage.getItem(JOURNAL_COMPOSER_DRAFT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function persistComposerDraft(value: string) {
  try {
    if (value) window.localStorage.setItem(JOURNAL_COMPOSER_DRAFT_STORAGE_KEY, value)
    else window.localStorage.removeItem(JOURNAL_COMPOSER_DRAFT_STORAGE_KEY)
  } catch {
    // Draft persistence is a convenience; typing and sending should keep working if storage is unavailable.
  }
}

function readStoredPrivacyModeEnabled() {
  try {
    return window.localStorage.getItem(JOURNAL_PRIVACY_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistPrivacyModeEnabled(value: boolean) {
  try {
    if (value) window.localStorage.setItem(JOURNAL_PRIVACY_MODE_STORAGE_KEY, '1')
    else window.localStorage.removeItem(JOURNAL_PRIVACY_MODE_STORAGE_KEY)
  } catch {
    // Privacy mode persistence is optional; journal should still work without localStorage access.
  }
}

function isImageAttachment(contentType?: string, fileName?: string) {
  if (contentType?.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp)$/i.test(fileName ?? '')
}

function hasSingleImageAttachment(item: JournalMessageDTO) {
  return (
    item.attachments.length === 1 &&
    isImageAttachment(item.attachments[0].contentType, item.attachments[0].fileName)
  )
}

function shouldCompactJournalMessage(item: JournalMessageDTO, previous?: JournalMessageDTO) {
  if (!previous || previous.author !== item.author) return false
  const currentTime = new Date(item.timestamp).getTime()
  const previousTime = new Date(previous.timestamp).getTime()
  return currentTime >= previousTime && currentTime - previousTime <= JOURNAL_BATCH_WINDOW_MS
}

function expandSelectionToWord(value: string, start: number, end: number) {
  if (start !== end) return { start, end }
  let nextStart = start
  let nextEnd = end
  while (nextStart > 0 && !/\s/.test(value[nextStart - 1])) nextStart -= 1
  while (nextEnd < value.length && !/\s/.test(value[nextEnd])) nextEnd += 1
  return { start: nextStart, end: nextEnd }
}

function expandSelectionToLines(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nextBreak = value.indexOf('\n', end)
  return {
    start: lineStart,
    end: nextBreak === -1 ? value.length : nextBreak,
  }
}

function applyInlineFormat(value: string, start: number, end: number, before: string, after = before) {
  const range = expandSelectionToWord(value, start, end)
  const selected = value.slice(range.start, range.end)
  const wrapped = selected ? `${before}${selected}${after}` : `${before}${after}`
  return {
    value: `${value.slice(0, range.start)}${wrapped}${value.slice(range.end)}`,
    selectionStart: range.start + before.length,
    selectionEnd: range.start + before.length + selected.length,
  }
}

function applyLineFormat(value: string, start: number, end: number, transform: (line: string, index: number) => string) {
  const range = expandSelectionToLines(value, start, end)
  const selected = value.slice(range.start, range.end)
  const lines = selected.split('\n')
  const formatted = lines.map(transform).join('\n')
  return {
    value: `${value.slice(0, range.start)}${formatted}${value.slice(range.end)}`,
    selectionStart: range.start,
    selectionEnd: range.start + formatted.length,
  }
}

function applyMarkdownFormat(value: string, start: number, end: number, format: MarkdownFormat) {
  switch (format) {
    case 'bold':
      return applyInlineFormat(value, start, end, '**')
    case 'italic':
      return applyInlineFormat(value, start, end, '*')
    case 'boldItalic':
      return applyInlineFormat(value, start, end, '***')
    case 'underline':
      return applyInlineFormat(value, start, end, '__')
    case 'strike':
      return applyInlineFormat(value, start, end, '~~')
    case 'inlineCode':
      return applyInlineFormat(value, start, end, '`')
    case 'codeBlock': {
      const range = expandSelectionToLines(value, start, end)
      const selected = value.slice(range.start, range.end)
      const formatted = `\`\`\`\n${selected}\n\`\`\``
      return {
        value: `${value.slice(0, range.start)}${formatted}${value.slice(range.end)}`,
        selectionStart: range.start + 4,
        selectionEnd: range.start + 4 + selected.length,
      }
    }
    case 'h1':
    case 'h2': {
      const level = Number(format.slice(1))
      const prefix = `${'#'.repeat(level)} `
      return applyLineFormat(value, start, end, line => `${prefix}${line.replace(/^#{1,3}\s+/, '')}`)
    }
    case 'quote':
      return applyLineFormat(value, start, end, line => `> ${line.replace(/^> ?/, '')}`)
    case 'unorderedList':
      return applyLineFormat(value, start, end, line => `- ${line.replace(/^(\s*)([-*]|\d+\.)\s+/, '$1')}`)
    case 'orderedList':
      return applyLineFormat(value, start, end, (line, index) => `${index + 1}. ${line.replace(/^(\s*)([-*]|\d+\.)\s+/, '$1')}`)
    default:
      return { value, selectionStart: start, selectionEnd: end }
  }
}

const JournalComposer = memo(function JournalComposer({
  saving,
  onSend,
  privacyModeEnabled,
  editModalOpen,
}: {
  saving: boolean
  onSend: (content: string, images: File[]) => Promise<boolean>
  privacyModeEnabled: boolean
  editModalOpen: boolean
}) {
  const [initialComposer] = useState(readStoredComposerDraft)
  const [hasComposerText, setHasComposerText] = useState(() => Boolean(initialComposer.trim()))
  const [composerDisplayValue, setComposerDisplayValue] = useState(initialComposer)
  const [maskScrollbarWidth, setMaskScrollbarWidth] = useState(0)
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<PendingImagePreview[]>([])
  const [pendingLocations, setPendingLocations] = useState<JournalLocation[]>([])
  const [pendingYoutubeLinks, setPendingYoutubeLinks] = useState<JournalYoutubeLink[]>([])
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false)
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('')
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [locationLongInput, setLocationLongInput] = useState('')
  const [locationLatInput, setLocationLatInput] = useState('')
  const [formatMenuPosition, setFormatMenuPosition] = useState<FormatMenuPosition | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composerValueRef = useRef(initialComposer)
  const draftSaveTimerRef = useRef<number | null>(null)
  const focusAfterSendRef = useRef(false)
  const maskedInputOverlayRef = useRef<HTMLDivElement | null>(null)
  const maskedInputStyle: CSSProperties = {
    ['--journal-mask-scrollbar-width' as string]: `${maskScrollbarWidth}px`,
  }

  const getMaskedComposerDisplay = useCallback((value: string) => {
    if (!privacyModeEnabled) return value
    const revealStart = Math.max(0, value.lastIndexOf(' ') + 1)
    return value
      .split('')
      .map((char, index) => {
        if (char === '\n' || char === '\r' || char === '\t' || char === ' ') return char
        return index < revealStart ? '•' : char
      })
      .join('')
  }, [privacyModeEnabled])

  const focusComposerInput = useCallback((attempt = 0) => {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      if (textarea.disabled && attempt < 4) {
        focusComposerInput(attempt + 1)
        return
      }
      textarea.focus()
    })
  }, [])

  const resizeComposerInput = useCallback((textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto'
    const borderHeight = textarea.offsetHeight - textarea.clientHeight
    const fullHeight = textarea.scrollHeight + borderHeight
    const nextHeight = Math.min(fullHeight, COMPOSER_MAX_HEIGHT)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = fullHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
    setMaskScrollbarWidth(Math.max(0, textarea.offsetWidth - textarea.clientWidth))
  }, [])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (textarea) resizeComposerInput(textarea)
  }, [resizeComposerInput])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    setMaskScrollbarWidth(Math.max(0, textarea.offsetWidth - textarea.clientWidth))
  }, [privacyModeEnabled])

  const flushComposerDraft = useCallback((value = composerValueRef.current) => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current)
      draftSaveTimerRef.current = null
    }
    persistComposerDraft(value)
  }, [])

  const scheduleComposerDraftSave = useCallback((value: string) => {
    if (draftSaveTimerRef.current !== null) window.clearTimeout(draftSaveTimerRef.current)
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null
      persistComposerDraft(value)
    }, JOURNAL_COMPOSER_DRAFT_SAVE_DELAY_MS)
  }, [])

  useEffect(() => {
    function handlePageHide() {
      flushComposerDraft()
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      flushComposerDraft()
    }
  }, [flushComposerDraft])

  useEffect(() => {
    if (saving || !focusAfterSendRef.current) return
    focusAfterSendRef.current = false
    focusComposerInput()
  }, [focusComposerInput, saving])

  useEffect(() => {
    const previews = selectedImages.map(file => ({ file, url: URL.createObjectURL(file) }))
    setImagePreviews(previews)
    return () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url)
    }
  }, [selectedImages])

  useEffect(() => {
    if (editModalOpen) setFormatMenuPosition(null)
  }, [editModalOpen])

  useEffect(() => {
    if (!formatMenuPosition) return undefined

    function closeFormatMenu() {
      setFormatMenuPosition(null)
    }

    function handleDocumentMouseDown(event: globalThis.MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) {
        closeFormatMenu()
        return
      }
      if (target.closest('.journal-format-menu') || target.closest('.journal-native-input')) return
      closeFormatMenu()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeFormatMenu()
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [formatMenuPosition])

  function appendImages(files: File[]) {
    const images = files.filter(file => file.type.startsWith('image/'))
    if (images.length === 0) return
    setSelectedImages(prev => [...prev, ...images].slice(0, 20))
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    appendImages(files)
  }

  async function submit() {
    const textarea = textareaRef.current
    const currentComposer = textarea?.value ?? composerValueRef.current
    const textContent = currentComposer.trim()
    const content = buildJournalContent(textContent, pendingLocations, pendingYoutubeLinks)
    if ((!content && selectedImages.length === 0) || saving) return
    const sent = await onSend(content, selectedImages)
    if (!sent) return
    composerValueRef.current = ''
    setComposerDisplayValue('')
    if (textarea) {
      textarea.value = ''
      resizeComposerInput(textarea)
    }
    focusAfterSendRef.current = true
    focusComposerInput()
    setHasComposerText(false)
    setSelectedImages([])
    setPendingLocations([])
    setPendingYoutubeLinks([])
    flushComposerDraft('')
  }

  function handleComposerChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.currentTarget.value
    composerValueRef.current = value
    setComposerDisplayValue(value)
    setHasComposerText(prev => {
      const next = Boolean(value.trim())
      return prev === next ? prev : next
    })
    scheduleComposerDraftSave(value)
    resizeComposerInput(event.currentTarget)
    if (maskedInputOverlayRef.current) maskedInputOverlayRef.current.scrollTop = event.currentTarget.scrollTop
  }

  function openFormatMenu(event: MouseEvent<HTMLTextAreaElement>) {
    if (saving || editModalOpen) return
    event.preventDefault()
    const estimatedMenuWidth = 340
    const estimatedMenuHeight = 360
    const viewportPadding = 10
    const hasRoomBelow = window.innerHeight - event.clientY > estimatedMenuHeight
    setFormatMenuPosition({
      left: Math.min(Math.max(event.clientX, viewportPadding), window.innerWidth - estimatedMenuWidth - viewportPadding),
      top: Math.min(Math.max(event.clientY, viewportPadding), window.innerHeight - viewportPadding),
      placement: hasRoomBelow ? 'below' : 'above',
    })
    event.currentTarget.focus()
  }

  function handleComposerAttachAction(action: ComposerAttachAction) {
    switch (action) {
      case 'image':
        fileInputRef.current?.click()
        break
      case 'location':
        setLocationLongInput('')
        setLocationLatInput('')
        setLocationModalOpen(true)
        break
      case 'youtube':
        setYoutubeUrlInput('')
        setYoutubeModalOpen(true)
        break
    }
  }

  function closeLocationModal() {
    setLocationModalOpen(false)
    setLocationLongInput('')
    setLocationLatInput('')
  }

  function closeYoutubeModal() {
    setYoutubeModalOpen(false)
    setYoutubeUrlInput('')
    setYoutubeLoading(false)
  }

  async function confirmYoutubeLink() {
    const nextUrl = youtubeUrlInput.trim()
    if (!nextUrl || youtubeLoading) return

    setYoutubeLoading(true)
    try {
      const metadata = await fetchJournalYoutubeMetadata(nextUrl)
      setPendingYoutubeLinks(prev => [...prev, metadata])
      closeYoutubeModal()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Không lấy được thông tin YouTube')
    } finally {
      setYoutubeLoading(false)
    }
  }

  function confirmLocation() {
    const location = parseJournalLocationInput(locationLatInput, locationLongInput)
    if (!location) {
      message.error('Nhập vĩ độ và kinh độ hợp lệ')
      return
    }
    setPendingLocations(prev => [...prev, location])
    closeLocationModal()
  }

  const composerAttachMenuItems: MenuProps['items'] = composerAttachOptions.map(option => ({
    key: option.action,
    label: option.label,
    icon: option.icon,
  }))

  function selectMarkdownFormat(format: MarkdownFormat) {
    const textarea = textareaRef.current
    if (!textarea) return
    const result = applyMarkdownFormat(textarea.value, textarea.selectionStart, textarea.selectionEnd, format)
    textarea.value = result.value
    composerValueRef.current = result.value
    setComposerDisplayValue(result.value)
    setHasComposerText(Boolean(result.value.trim()))
    scheduleComposerDraftSave(result.value)
    setFormatMenuPosition(null)
    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
      resizeComposerInput(textarea)
    })
  }

  return (
    <div className="journal-composer">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="journal-file-input"
        onChange={event => {
          appendImages(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <Dropdown
        menu={{
          items: composerAttachMenuItems,
          onClick: ({ key }) => handleComposerAttachAction(key as ComposerAttachAction),
        }}
        trigger={['click']}
        disabled={saving}
      >
        <Button
          shape="circle"
          icon={<PlusOutlined />}
          disabled={saving}
          aria-label="Add attachment"
        />
      </Dropdown>
      <div className="journal-composer-body">
        {imagePreviews.length > 0 || pendingLocations.length > 0 || pendingYoutubeLinks.length > 0 ? (
          <div className="journal-composer-attachments">
            {pendingLocations.length > 0 ? (
              <div className="journal-pending-locations">
                {pendingLocations.map((location, index) => (
                  <div className="journal-pending-location" key={`${location.lat}-${location.long}-${index}`}>
                    <EnvironmentOutlined aria-hidden />
                    <span>
                      {location.lat}, {location.long}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove location"
                      onClick={() => setPendingLocations(prev => prev.filter((_, locationIndex) => locationIndex !== index))}
                    >
                      <CloseOutlined />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {pendingYoutubeLinks.length > 0 ? (
              <div className="journal-pending-youtube-list">
                {pendingYoutubeLinks.map((link, index) => (
                  <div className="journal-pending-youtube" key={`${link.videoId}-${index}`}>
                    <a
                      className="journal-youtube-card"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img className="journal-youtube-thumb" src={link.thumbnailUrl} alt="" />
                      <span className="journal-youtube-title">{link.title}</span>
                    </a>
                    <button
                      type="button"
                      aria-label="Remove YouTube link"
                      onClick={() => setPendingYoutubeLinks(prev => prev.filter((_, linkIndex) => linkIndex !== index))}
                    >
                      <CloseOutlined />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {imagePreviews.length > 0 ? (
              <div className="journal-pending-images">
                {imagePreviews.map((preview, index) => (
                  <div className="journal-pending-image" key={`${preview.file.name}-${preview.file.lastModified}-${index}`}>
                    <img src={preview.url} alt={preview.file.name} />
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => setSelectedImages(prev => prev.filter((_, imageIndex) => imageIndex !== index))}
                    >
                      <CloseOutlined />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          className={`journal-native-input${privacyModeEnabled ? ' is-privacy-masked' : ''}`}
          defaultValue={initialComposer}
          onChange={handleComposerChange}
          onPaste={handlePaste}
          onScroll={event => {
            if (maskedInputOverlayRef.current) maskedInputOverlayRef.current.scrollTop = event.currentTarget.scrollTop
          }}
          onContextMenu={openFormatMenu}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          rows={1}
          placeholder="Write a message"
          disabled={saving}
        />
        {privacyModeEnabled ? (
          <div
            className="journal-native-input-mask"
            ref={maskedInputOverlayRef}
            style={maskedInputStyle}
            aria-hidden="true"
          >
            {getMaskedComposerDisplay(composerDisplayValue)}
          </div>
        ) : null}
        {formatMenuPosition ? (
          <div
            className={`journal-format-menu is-${formatMenuPosition.placement}`}
            style={{ left: formatMenuPosition.left, top: formatMenuPosition.top }}
            onMouseDown={event => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {markdownFormatOptions.map(option => (
              <button
                type="button"
                key={option.format}
                className="journal-format-menu-item"
                onClick={() => selectMarkdownFormat(option.format)}
              >
                <span className="journal-format-menu-icon">{option.icon}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <Button
        type="primary"
        shape="circle"
        icon={<SendOutlined />}
        loading={saving}
        disabled={!hasComposerText && selectedImages.length === 0 && pendingLocations.length === 0 && pendingYoutubeLinks.length === 0}
        onClick={() => void submit()}
        aria-label="Send message"
      />
      <Modal
        open={locationModalOpen}
        title="Thêm địa điểm"
        okText="Thêm"
        onOk={confirmLocation}
        onCancel={closeLocationModal}
        destroyOnClose
      >
        <JournalLocationForm
          latInput={locationLatInput}
          longInput={locationLongInput}
          onLatInputChange={setLocationLatInput}
          onLongInputChange={setLocationLongInput}
        />
      </Modal>
      <Modal
        open={youtubeModalOpen}
        title="Thêm link YouTube"
        okText="Thêm"
        confirmLoading={youtubeLoading}
        onOk={() => void confirmYoutubeLink()}
        onCancel={closeYoutubeModal}
        destroyOnClose
      >
        <label className="journal-youtube-field">
          <span>YouTube URL</span>
          <Input
            value={youtubeUrlInput}
            onChange={event => setYoutubeUrlInput(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            onPressEnter={() => void confirmYoutubeLink()}
          />
        </label>
      </Modal>
    </div>
  )
})

const JournalMessageEditor = memo(function JournalMessageEditor({
  open,
  saving,
  editingMessage,
  onCancel,
  onSave,
}: {
  open: boolean
  saving: boolean
  editingMessage: JournalMessageDTO | null
  onCancel: () => void
  onSave: (input: { content: string; images: File[]; removeAttachments: string[] }) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [locations, setLocations] = useState<JournalLocation[]>([])
  const [youtubeLinks, setYoutubeLinks] = useState<JournalYoutubeLink[]>([])
  const [removedAttachmentUrls, setRemovedAttachmentUrls] = useState<string[]>([])
  const [newImages, setNewImages] = useState<File[]>([])
  const [newImagePreviews, setNewImagePreviews] = useState<PendingImagePreview[]>([])
  const [locationModalOpen, setLocationModalOpen] = useState(false)
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false)
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('')
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [locationLongInput, setLocationLongInput] = useState('')
  const [locationLatInput, setLocationLatInput] = useState('')
  const [formatMenuPosition, setFormatMenuPosition] = useState<FormatMenuPosition | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<TextAreaRef | null>(null)
  const initialContentRef = useRef('')

  useEffect(() => {
    if (!open || !editingMessage) return
    const parsed = splitJournalContent(editingMessage.content)
    setText(parsed.text)
    setLocations(parsed.locations)
    setYoutubeLinks(parsed.youtubeLinks)
    setRemovedAttachmentUrls([])
    setNewImages([])
    setLocationModalOpen(false)
    setYoutubeModalOpen(false)
    setYoutubeUrlInput('')
    setYoutubeLoading(false)
    setLocationLongInput('')
    setLocationLatInput('')
    setFormatMenuPosition(null)
    initialContentRef.current = editingMessage.content
  }, [editingMessage, open])

  useEffect(() => {
    if (!formatMenuPosition) return undefined

    function closeFormatMenu() {
      setFormatMenuPosition(null)
    }

    function handleDocumentMouseDown(event: globalThis.MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) {
        closeFormatMenu()
        return
      }
      if (target.closest('.journal-format-menu') || target.closest('.journal-message-editor-input')) return
      closeFormatMenu()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeFormatMenu()
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [formatMenuPosition])

  useEffect(() => {
    const previews = newImages.map(file => ({ file, url: URL.createObjectURL(file) }))
    setNewImagePreviews(previews)
    return () => {
      for (const preview of previews) URL.revokeObjectURL(preview.url)
    }
  }, [newImages])

  const keptAttachments = editingMessage?.attachments.filter(
    attachment => !removedAttachmentUrls.includes(attachment.originalUrl),
  ) ?? []

  const canSave = Boolean(
    text.trim() ||
    locations.length > 0 ||
    youtubeLinks.length > 0 ||
    keptAttachments.length > 0 ||
    newImages.length > 0,
  )

  function isEditDirty() {
    if (!editingMessage) return false
    const currentContent = buildJournalContent(text, locations, youtubeLinks)
    return (
      currentContent !== initialContentRef.current ||
      removedAttachmentUrls.length > 0 ||
      newImages.length > 0
    )
  }

  function requestClose() {
    if (!isEditDirty()) {
      onCancel()
      return
    }
    Modal.confirm({
      title: 'Hủy chỉnh sửa?',
      content: 'Thay đổi chưa lưu sẽ bị mất.',
      okText: 'Hủy chỉnh sửa',
      okButtonProps: { danger: true },
      cancelText: 'Tiếp tục sửa',
      onOk: onCancel,
    })
  }

  function appendImages(files: File[]) {
    const images = files.filter(file => file.type.startsWith('image/'))
    if (images.length === 0) return
    const maxNewImages = Math.max(0, 20 - keptAttachments.length)
    setNewImages(prev => [...prev, ...images].slice(0, maxNewImages))
  }

  function handleAttachAction(action: ComposerAttachAction) {
    switch (action) {
      case 'image':
        fileInputRef.current?.click()
        break
      case 'location':
        setLocationLongInput('')
        setLocationLatInput('')
        setLocationModalOpen(true)
        break
      case 'youtube':
        setYoutubeUrlInput('')
        setYoutubeModalOpen(true)
        break
    }
  }

  function closeLocationModal() {
    setLocationModalOpen(false)
    setLocationLongInput('')
    setLocationLatInput('')
  }

  function closeYoutubeModal() {
    setYoutubeModalOpen(false)
    setYoutubeUrlInput('')
    setYoutubeLoading(false)
  }

  async function confirmYoutubeLink() {
    const nextUrl = youtubeUrlInput.trim()
    if (!nextUrl || youtubeLoading) return

    setYoutubeLoading(true)
    try {
      const metadata = await fetchJournalYoutubeMetadata(nextUrl)
      setYoutubeLinks(prev => [...prev, metadata])
      closeYoutubeModal()
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Không lấy được thông tin YouTube')
    } finally {
      setYoutubeLoading(false)
    }
  }

  function confirmLocation() {
    const location = parseJournalLocationInput(locationLatInput, locationLongInput)
    if (!location) {
      message.error('Nhập vĩ độ và kinh độ hợp lệ')
      return
    }
    setLocations(prev => [...prev, location])
    closeLocationModal()
  }

  async function handleSave() {
    if (!canSave || saving) return
    await onSave({
      content: buildJournalContent(text, locations, youtubeLinks),
      images: newImages,
      removeAttachments: removedAttachmentUrls,
    })
  }

  const attachMenuItems: MenuProps['items'] = composerAttachOptions.map(option => ({
    key: option.action,
    label: option.label,
    icon: option.icon,
  }))

  function openFormatMenu(event: MouseEvent<HTMLTextAreaElement>) {
    if (saving) return
    event.preventDefault()
    const estimatedMenuWidth = 340
    const estimatedMenuHeight = 360
    const viewportPadding = 10
    const hasRoomBelow = window.innerHeight - event.clientY > estimatedMenuHeight
    setFormatMenuPosition({
      left: Math.min(Math.max(event.clientX, viewportPadding), window.innerWidth - estimatedMenuWidth - viewportPadding),
      top: Math.min(Math.max(event.clientY, viewportPadding), window.innerHeight - viewportPadding),
      placement: hasRoomBelow ? 'below' : 'above',
    })
    event.currentTarget.focus()
  }

  function getEditorTextarea() {
    const element = textareaRef.current?.nativeElement
    return element instanceof HTMLTextAreaElement ? element : null
  }

  function selectMarkdownFormat(format: MarkdownFormat) {
    const textarea = getEditorTextarea()
    if (!textarea) return
    const result = applyMarkdownFormat(textarea.value, textarea.selectionStart, textarea.selectionEnd, format)
    setText(result.value)
    setFormatMenuPosition(null)
    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  return (
    <>
      <Modal
        open={open}
        title="Edit message"
        okText="Save"
        cancelText="Cancel"
        okButtonProps={{ disabled: !canSave, loading: saving }}
        onOk={() => void handleSave()}
        onCancel={requestClose}
        maskClosable={!formatMenuPosition && !locationModalOpen && !youtubeModalOpen}
        width={720}
        destroyOnClose
      >
        <div className="journal-message-editor">
          <div className="journal-message-editor-toolbar">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="journal-file-input"
              onChange={event => {
                appendImages(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            <Dropdown
              menu={{
                items: attachMenuItems,
                onClick: ({ key }) => handleAttachAction(key as ComposerAttachAction),
              }}
              trigger={['click']}
              disabled={saving}
            >
              <Button shape="circle" icon={<PlusOutlined />} disabled={saving} aria-label="Add attachment" />
            </Dropdown>
          </div>

          {keptAttachments.length > 0 || newImagePreviews.length > 0 || locations.length > 0 || youtubeLinks.length > 0 ? (
            <div className="journal-composer-attachments">
              {locations.length > 0 ? (
                <div className="journal-pending-locations">
                  {locations.map((location, index) => (
                    <div className="journal-pending-location" key={`${location.lat}-${location.long}-${index}`}>
                      <EnvironmentOutlined aria-hidden />
                      <span>
                        {location.lat}, {location.long}
                      </span>
                      <button
                        type="button"
                        aria-label="Remove location"
                        onClick={() => setLocations(prev => prev.filter((_, locationIndex) => locationIndex !== index))}
                      >
                        <CloseOutlined />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {youtubeLinks.length > 0 ? (
                <div className="journal-pending-youtube-list">
                  {youtubeLinks.map((link, index) => (
                    <div className="journal-pending-youtube" key={`${link.videoId}-${index}`}>
                      <a
                        className="journal-youtube-card"
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img className="journal-youtube-thumb" src={link.thumbnailUrl} alt="" />
                        <span className="journal-youtube-title">{link.title}</span>
                      </a>
                      <button
                        type="button"
                        aria-label="Remove YouTube link"
                        onClick={() => setYoutubeLinks(prev => prev.filter((_, linkIndex) => linkIndex !== index))}
                      >
                        <CloseOutlined />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {keptAttachments.length > 0 || newImagePreviews.length > 0 ? (
                <div className="journal-pending-images">
                  {keptAttachments.map(attachment => (
                    isImageAttachment(attachment.contentType, attachment.fileName) ? (
                      <div className="journal-pending-image" key={attachment.originalUrl}>
                        <img src={attachment.url} alt={attachment.fileName} />
                        <button
                          type="button"
                          aria-label="Remove image"
                          onClick={() => setRemovedAttachmentUrls(prev => [...prev, attachment.originalUrl])}
                        >
                          <CloseOutlined />
                        </button>
                      </div>
                    ) : (
                      <div className="journal-pending-file" key={attachment.originalUrl}>
                        <FileOutlined aria-hidden />
                        <span>{attachment.fileName}</span>
                        <button
                          type="button"
                          aria-label="Remove attachment"
                          onClick={() => setRemovedAttachmentUrls(prev => [...prev, attachment.originalUrl])}
                        >
                          <CloseOutlined />
                        </button>
                      </div>
                    )
                  ))}
                  {newImagePreviews.map((preview, index) => (
                    <div className="journal-pending-image" key={`${preview.file.name}-${preview.file.lastModified}-${index}`}>
                      <img src={preview.url} alt={preview.file.name} />
                      <button
                        type="button"
                        aria-label="Remove image"
                        onClick={() => setNewImages(prev => prev.filter((_, imageIndex) => imageIndex !== index))}
                      >
                        <CloseOutlined />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <Input.TextArea
            ref={textareaRef}
            className="journal-message-editor-input"
            value={text}
            onChange={event => setText(event.target.value)}
            onContextMenu={openFormatMenu}
            autoSize={{ minRows: 8, maxRows: 18 }}
            placeholder="Write journal message"
            disabled={saving}
          />
          {formatMenuPosition ? (
            <div
              className={`journal-format-menu is-modal is-${formatMenuPosition.placement}`}
              style={{ left: formatMenuPosition.left, top: formatMenuPosition.top }}
              onMouseDown={event => {
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              {markdownFormatOptions.map(option => (
                <button
                  type="button"
                  key={option.format}
                  className="journal-format-menu-item"
                  onClick={() => selectMarkdownFormat(option.format)}
                >
                  <span className="journal-format-menu-icon">{option.icon}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={locationModalOpen}
        title="Thêm địa điểm"
        okText="Thêm"
        onOk={confirmLocation}
        onCancel={closeLocationModal}
        destroyOnClose
      >
        <JournalLocationForm
          latInput={locationLatInput}
          longInput={locationLongInput}
          onLatInputChange={setLocationLatInput}
          onLongInputChange={setLocationLongInput}
        />
      </Modal>
      <Modal
        open={youtubeModalOpen}
        title="Thêm link YouTube"
        okText="Thêm"
        confirmLoading={youtubeLoading}
        onOk={() => void confirmYoutubeLink()}
        onCancel={closeYoutubeModal}
        destroyOnClose
      >
        <label className="journal-youtube-field">
          <span>YouTube URL</span>
          <Input
            value={youtubeUrlInput}
            onChange={event => setYoutubeUrlInput(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            onPressEnter={() => void confirmYoutubeLink()}
          />
        </label>
      </Modal>
    </>
  )
})

export default function JournalPage({ onTrackClick }: { onTrackClick?: (id: string) => void }) {
  const [items, setItems] = useState<JournalMessageDTO[]>([])
  const [musicTracks, setMusicTracks] = useState<TrackDTO[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<JournalMessageDTO | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [afterDate, setAfterDate] = useState<Dayjs | null>(null)
  const [beforeDate, setBeforeDate] = useState<Dayjs | null>(null)
  const [month, setMonth] = useState<Dayjs | null>(null)
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(readStoredPrivacyModeEnabled)
  const [activeActionMessageId, setActiveActionMessageId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const requestSeqRef = useRef(0)
  const stickToBottomRef = useRef(true)
  const hasActiveFilters = Boolean(search.trim() || afterDate || beforeDate || month || pinnedOnly)
  const showMusicInTimeline = !pinnedOnly && !search.trim()

  useEffect(() => {
    let cancelled = false
    fetchLibrary()
      .then(tracks => {
        if (cancelled) return
        setMusicTracks(filterJournalMusicTracks(tracks))
      })
      .catch(() => {
        if (cancelled) return
        setMusicTracks([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const visibleMusicTracks = useMemo(() => {
    if (!showMusicInTimeline) return []
    const byDate = filterJournalMusicByDate(musicTracks, { afterDate, beforeDate, month })
    return filterJournalMusicByLoadedWindow(byDate, items, hasMore)
  }, [afterDate, beforeDate, hasMore, items, month, musicTracks, showMusicInTimeline])

  const timelineItems = useMemo(
    () => buildJournalTimeline(items, visibleMusicTracks),
    [items, visibleMusicTracks],
  )

  useEffect(() => {
    persistPrivacyModeEnabled(privacyModeEnabled)
  }, [privacyModeEnabled])

  const scrollJournalToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      const panel = panelRef.current
      if (panel) panel.scrollTop = panel.scrollHeight
    })
  }, [])

  const loadMessages = useCallback(async (nextPage: number, append: boolean) => {
    const requestSeq = ++requestSeqRef.current
    const panel = panelRef.current
    const previousScrollHeight = panel?.scrollHeight ?? 0
    const previousScrollTop = panel?.scrollTop ?? 0
    if (append) setLoadingMore(true)
    else setLoading(true)
    stickToBottomRef.current = !append
    setError(null)
    try {
      if (pinnedOnly) {
        if (append) return
        const result = await fetchPinnedJournalMessages()
        if (requestSeq !== requestSeqRef.current) return
        const chronologicalItems = [...result.items].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        setItems(chronologicalItems)
        setTotal(chronologicalItems.length)
        setPage(1)
        setHasMore(false)
        window.requestAnimationFrame(() => scrollJournalToBottom())
        return
      }

      const result = await fetchJournalMessages({
        q: search,
        after: month ? null : afterDate?.format('YYYY-MM-DD'),
        before: month ? null : beforeDate?.format('YYYY-MM-DD'),
        month: month?.format('YYYY-MM'),
        page: nextPage,
        limit: hasActiveFilters ? FILTER_PAGE_SIZE : PAGE_SIZE,
      })
      if (requestSeq !== requestSeqRef.current) return
      const chronologicalItems = [...result.items].reverse()
      setItems(prev => (append ? [...chronologicalItems, ...prev] : chronologicalItems))
      setTotal(result.total)
      setPage(result.page)
      setHasMore(result.hasMore)
      window.requestAnimationFrame(() => {
        const nextPanel = panelRef.current
        if (!nextPanel) return
        if (append) {
          nextPanel.scrollTop = nextPanel.scrollHeight - previousScrollHeight + previousScrollTop
        } else {
          scrollJournalToBottom()
        }
      })
    } catch (err) {
      if (requestSeq !== requestSeqRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to fetch journal')
      if (!append) setItems([])
    } finally {
      if (requestSeq !== requestSeqRef.current) return
      setLoading(false)
      setLoadingMore(false)
    }
  }, [afterDate, beforeDate, hasActiveFilters, month, pinnedOnly, scrollJournalToBottom, search])

  useEffect(() => {
    let cancelled = false
    loadMessages(1, false).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to fetch journal')
    })

    return () => {
      cancelled = true
    }
  }, [loadMessages])

  function handleTimelineScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    stickToBottomRef.current = distanceFromBottom < 80
    if (target.scrollTop > 96 || loading || loadingMore || !hasMore) return
    void loadMessages(page + 1, true)
  }

  function isMobileViewport() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
  }

  function handleAttachmentImageLoad() {
    if (stickToBottomRef.current) scrollJournalToBottom()
  }

  function openEdit(item: JournalMessageDTO) {
    if (editorOpen) return
    setEditing(item)
    setEditorOpen(true)
  }

  function closeEdit() {
    setEditorOpen(false)
    setEditing(null)
  }

  const handleSend = useCallback(async (content: string, images: File[]) => {
    if ((!content && images.length === 0) || saving) return false
    setSaving(true)
    try {
      const saved = await createJournalMessage({ content, author: 'Local', images })
      setItems(prev => [...prev, saved])
      setTotal(prev => prev + 1)
      stickToBottomRef.current = true
      scrollJournalToBottom()
      return true
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Send failed')
      return false
    } finally {
      setSaving(false)
    }
  }, [saving, scrollJournalToBottom])

  async function handleEditSave(input: { content: string; images: File[]; removeAttachments: string[] }) {
    if (saving || !editing) return
    setSaving(true)
    try {
      const saved = await updateJournalMessage(editing.id, input)
      setItems(prev => prev.map(item => (item.id === saved.id ? saved : item)))
      closeEdit()
      message.success('Updated')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteJournalMessage(id)
      setItems(prev => prev.filter(item => item.id !== id))
      setTotal(prev => Math.max(0, prev - 1))
      message.success('Deleted')
    } catch {
      message.error('Cannot delete message')
    }
  }

  function updatePinnedState(saved: JournalMessageDTO) {
    setItems(prev => {
      if (pinnedOnly) {
        if (!saved.pinned) return prev.filter(item => item.id !== saved.id)
        const without = prev.filter(item => item.id !== saved.id)
        return [...without, saved].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      }
      return prev.map(item => (item.id === saved.id ? saved : item))
    })
    if (pinnedOnly && !saved.pinned) {
      setTotal(prev => Math.max(0, prev - 1))
    }
  }

  async function handleTogglePin(item: JournalMessageDTO) {
    try {
      const saved = item.pinned ? await unpinJournalMessage(item.id) : await pinJournalMessage(item.id)
      updatePinnedState(saved)
      message.success(saved.pinned ? 'Đã ghim tin nhắn' : 'Đã bỏ ghim')
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Không thể cập nhật ghim')
    }
  }

  function togglePinnedFilter() {
    setPinnedOnly(current => {
      const next = !current
      if (next) {
        setSearch('')
        setAfterDate(null)
        setBeforeDate(null)
        setMonth(null)
        setFiltersOpen(false)
      }
      return next
    })
  }

  function clearJournalFilters() {
    setSearch('')
    setAfterDate(null)
    setBeforeDate(null)
    setMonth(null)
    setPinnedOnly(false)
  }

  return (
    <section className="journal-page" role="main">
      <div className="journal-main">
        <Button
          className={`journal-filter-trigger${hasActiveFilters ? ' is-active' : ''}`}
          icon={<MenuOutlined />}
          onClick={() => setFiltersOpen(true)}
          aria-label="Open journal filters"
        />
        <Button
          className={`journal-privacy-trigger${privacyModeEnabled ? ' is-active' : ''}`}
          icon={privacyModeEnabled ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          onClick={() => setPrivacyModeEnabled(enabled => !enabled)}
          aria-label={privacyModeEnabled ? 'Disable privacy mode' : 'Enable privacy mode'}
        >
          
        </Button>

        {error && <Alert showIcon type="error" message="Journal error" description={error} className="journal-alert" />}

        <div
          className="journal-panel"
          ref={panelRef}
          onScroll={handleTimelineScroll}
          onClick={() => {
            if (activeActionMessageId) setActiveActionMessageId(null)
          }}
        >
          {loading ? (
            <div className="journal-loading"><Spin /></div>
          ) : timelineItems.length === 0 ? (
            <Empty
              description={pinnedOnly ? 'Chưa có tin nhắn được ghim' : 'No messages'}
              className="journal-empty"
            />
          ) : (
            <>
              {hasMore ? (
                <div className="journal-load-more">
                  <Button loading={loadingMore} onClick={() => loadMessages(page + 1, true)}>
                    Load older
                  </Button>
                </div>
              ) : (
                <div className="journal-start-marker">
                  {pinnedOnly ? 'Tin đã ghim' : 'Start of journal'}
                </div>
              )}
              <List<JournalTimelineItem>
                dataSource={timelineItems}
                rowKey="id"
                renderItem={(entry, index) => {
                  if (entry.kind === 'track') {
                    return (
                      <List.Item className={`journal-row journal-row-music${privacyModeEnabled ? ' is-privacy-hidden' : ''}`}>
                        <JournalMusicCard track={entry.track} onClick={onTrackClick} />
                      </List.Item>
                    )
                  }

                  const item = entry.message
                  const previousMessage = timelineItems
                    .slice(0, index)
                    .reverse()
                    .find(candidate => candidate.kind === 'message')?.message
                  const isCompact = shouldCompactJournalMessage(item, previousMessage)
                  const isSingleImage = hasSingleImageAttachment(item)
                  const isHiddenByPrivacy = privacyModeEnabled

                  return (
                    <List.Item
                      className={`journal-row${isCompact ? ' is-compact' : ''}${isHiddenByPrivacy ? ' is-privacy-hidden' : ''}${item.pinned ? ' is-pinned' : ''}${activeActionMessageId === item.id ? ' is-actions-visible' : ''}`}
                      data-message-id={item.id}
                      onClick={() => {
                        if (!isMobileViewport()) return
                        setActiveActionMessageId(current => (current === item.id ? null : item.id))
                      }}
                      actions={[
                        <Button
                          key="pin"
                          type="text"
                          shape="circle"
                          icon={item.pinned ? <PushpinFilled /> : <PushpinOutlined />}
                          className={item.pinned ? 'journal-pin-button is-pinned' : 'journal-pin-button'}
                          onClick={event => {
                            event.stopPropagation()
                            void handleTogglePin(item)
                          }}
                          aria-label={item.pinned ? 'Bỏ ghim' : 'Ghim tin nhắn'}
                        />,
                        <Button
                          key="edit"
                          type="text"
                          shape="circle"
                          icon={<EditOutlined />}
                          onClick={event => {
                            event.stopPropagation()
                            openEdit(item)
                          }}
                        />,
                        <Popconfirm
                          key="delete"
                          title="Delete this message?"
                          okText="Delete"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => handleDelete(item.id)}
                        >
                          <Button
                            danger
                            type="text"
                            shape="circle"
                            icon={<DeleteOutlined />}
                            onClick={event => event.stopPropagation()}
                          />
                        </Popconfirm>,
                      ]}
                    >
                      <div className="journal-message">
                        {!isCompact ? (
                          <div className="journal-message-meta">
                            <b>{item.author}</b>
                            <span>{formatDateTime(item.timestamp)}</span>
                          </div>
                        ) : null}
                        {item.content || item.attachments.length > 0 ? (
                          <JournalMessageBody
                            content={item.content}
                            highlightTerm={search}
                            attachments={item.attachments}
                            isSingleImage={isSingleImage}
                            onAttachmentImageLoad={handleAttachmentImageLoad}
                          />
                        ) : null}
                      </div>
                    </List.Item>
                  )
                }}
              />
            </>
          )}
        </div>

        <JournalComposer
          saving={saving}
          onSend={handleSend}
          privacyModeEnabled={privacyModeEnabled}
          editModalOpen={editorOpen}
        />
      </div>

      <JournalMessageEditor
        open={editorOpen}
        saving={saving}
        editingMessage={editing}
        onCancel={closeEdit}
        onSave={handleEditSave}
      />

      <Drawer
        open={filtersOpen}
        title="Bộ lọc Journal"
        placement="right"
        width={520}
        onClose={() => setFiltersOpen(false)}
        footer={(
          <div className="journal-filter-drawer-footer">
            <Button onClick={clearJournalFilters} disabled={!hasActiveFilters}>
              Xóa bộ lọc
            </Button>
            <Button type="primary" onClick={() => setFiltersOpen(false)}>
              Hoàn tất
            </Button>
          </div>
        )}
      >
        <div className="journal-filter-panel">
          <section className="journal-filter-section">
            <Typography.Text className="journal-filter-label">Tìm kiếm</Typography.Text>
            <Input
              allowClear
              size="large"
              prefix={<SearchOutlined />}
              value={search}
              onChange={event => {
                setPinnedOnly(false)
                setSearch(event.target.value)
              }}
              placeholder="Search message text..."
            />
          </section>

          <section className="journal-filter-section">
            <div className="journal-filter-section-head">
              <Typography.Text className="journal-filter-label">Khoảng ngày</Typography.Text>
              <Typography.Text type="secondary">Lọc sau / trước ngày cụ thể</Typography.Text>
            </div>
            <div className="journal-filter-date-grid">
              <DatePicker
                {...JOURNAL_FILTER_DATE_PICKER_PROPS}
                value={afterDate}
                onChange={value => {
                  setPinnedOnly(false)
                  setAfterDate(value)
                  if (value) setMonth(null)
                }}
                placeholder="Sau ngày"
                style={{ width: '100%' }}
              />
              <DatePicker
                {...JOURNAL_FILTER_DATE_PICKER_PROPS}
                value={beforeDate}
                onChange={value => {
                  setPinnedOnly(false)
                  setBeforeDate(value)
                  if (value) setMonth(null)
                }}
                placeholder="Trước ngày"
                style={{ width: '100%' }}
              />
            </div>
          </section>

          <section className="journal-filter-section">
            <div className="journal-filter-section-head">
              <Typography.Text className="journal-filter-label">Theo tháng</Typography.Text>
              <Typography.Text type="secondary">Chọn một tháng cụ thể</Typography.Text>
            </div>
            <DatePicker
              {...JOURNAL_FILTER_DATE_PICKER_PROPS}
              picker="month"
              value={month}
              onChange={value => {
                setPinnedOnly(false)
                setMonth(value)
                if (value) {
                  setAfterDate(null)
                  setBeforeDate(null)
                }
              }}
              placeholder="Tháng"
              style={{ width: '100%' }}
            />
          </section>

          <section className="journal-filter-section">
            <Typography.Text className="journal-filter-label">Tin đã ghim</Typography.Text>
            <div className="journal-media-filter-actions">
              <button
                type="button"
                className={`journal-media-filter-action${pinnedOnly ? ' is-active' : ''}`}
                onClick={togglePinnedFilter}
              >
                <PushpinOutlined />
                <span>Chỉ hiển thị tin đã ghim{pinnedOnly && total > 0 ? ` (${total})` : ''}</span>
              </button>
            </div>
            {pinnedOnly ? (
              <Typography.Text type="secondary">
                Đang lọc timeline chỉ hiển thị tin đã ghim
              </Typography.Text>
            ) : null}
          </section>
        </div>
      </Drawer>
    </section>
  )
}
