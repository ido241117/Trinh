import JSZip from 'jszip'

export type ReaderTheme = 'dark' | 'light' | 'parchment'

export const READER_THEMES: Record<ReaderTheme, { bg: string; color: string; label: string }> = {
  dark: { bg: '#1e1e2e', color: '#cdd6f4', label: 'Nền tối' },
  light: { bg: '#ffffff', color: '#1a1a1a', label: 'Nền sáng' },
  parchment: { bg: '#fbf6ee', color: '#2f2a24', label: 'Giấy da' },
}

/** Extra bottom space so the last lines can scroll up toward the top of the viewport. */
export const READER_BOTTOM_PADDING = '85vh'

export function buildReaderStyleCss(theme: ReaderTheme, fontSize: number, sideMargin: number) {
  const { bg, color } = READER_THEMES[theme]
  return [
    // height:auto so padding-bottom actually extends scrollHeight (height:100% + border-box eats it)
    `html,body{height:auto!important;min-height:100%!important;}`,
    `html{font-size:${fontSize}px!important;}`,
    `body{background:${bg}!important;color:${color}!important;box-sizing:content-box!important;margin:0!important;`,
    `padding-top:28px!important;padding-bottom:${READER_BOTTOM_PADDING}!important;`,
    `padding-left:${sideMargin}px!important;padding-right:${sideMargin}px!important;`,
    `font-family:system-ui,"Segoe UI","Noto Sans",Arial,sans-serif!important;`,
    `line-height:1.72!important;text-align:left!important;word-spacing:normal!important;letter-spacing:normal!important;}`,
    // MeTruyenChu / converter EPUBs often set .chapter{max-width:48rem}; Hako/Calibre do not.
    // Let the reader sideMargin control width instead of leaving a short column + empty right gutter.
    `body,.chapter,#chapter-content,.col{max-width:none!important;width:auto!important;}`,
    `p,li,td,th,span,div,a,blockquote{color:inherit!important;font-size:inherit!important;text-align:left!important;hyphens:none!important;}`,
    `h1{font-size:1.8em!important;}h2{font-size:1.4em!important;}h3{font-size:1.2em!important;}`,
    `::-webkit-scrollbar{width:4px;height:4px;}`,
    `::-webkit-scrollbar-track{background:transparent;}`,
    `::-webkit-scrollbar-thumb{background:rgba(128,128,128,0.3);border-radius:2px;}`,
    `::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,0.55);}`,
    `*{scrollbar-width:thin;scrollbar-color:rgba(128,128,128,0.3) transparent;}`,
  ].join('')
}

export async function requiredZipText(zip: JSZip, pathName: string) {
  const file = zip.file(pathName)
  if (!file) throw new Error(`Thiếu file trong EPUB: ${pathName}`)
  return file.async('text')
}

export function resolvePath(base: string, relative: string) {
  const parts = `${base}${relative}`.split('/')
  const output: string[] = []
  for (const part of parts) {
    if (part === '..') output.pop()
    else if (part && part !== '.') output.push(part)
  }
  return output.join('/')
}

export function isRelativeAsset(value: string) {
  return !value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('data:')
}

export function mimeForExtension(extension: string) {
  return (
    {
      css: 'text/css',
      gif: 'image/gif',
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      png: 'image/png',
      svg: 'image/svg+xml',
      ttf: 'font/ttf',
      webp: 'image/webp',
      woff: 'font/woff',
      woff2: 'font/woff2',
    }[extension] ?? 'application/octet-stream'
  )
}

export async function parseEpubSpine(data: ArrayBuffer) {
  const zip = await JSZip.loadAsync(data)
  const parser = new DOMParser()
  const containerXml = await requiredZipText(zip, 'META-INF/container.xml')
  const containerDoc = parser.parseFromString(containerXml, 'text/xml')
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new Error('Không tìm thấy OPF trong EPUB')

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''
  const opfXml = await requiredZipText(zip, opfPath)
  const opfDoc = parser.parseFromString(opfXml, 'application/xml')
  const manifest: Record<string, string> = {}

  opfDoc.querySelectorAll('manifest item').forEach(item => {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest[id] = resolvePath(opfDir, href)
  })

  const spine = Array.from(opfDoc.querySelectorAll('spine itemref'))
    .map(ref => manifest[ref.getAttribute('idref') ?? ''])
    .filter(Boolean)

  if (!spine.length) throw new Error('EPUB không có chapter để hiển thị')

  return { zip, spine }
}
