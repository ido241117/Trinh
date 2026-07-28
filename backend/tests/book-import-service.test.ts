import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  normalizeImportSourceName,
  parseEpubMetadata,
} from '../src/services/book-import-service.js'

async function buildSampleEpub() {
  const zip = new JSZip()
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  )
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Sample Book Title</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:description>A short description.</dc:description>
  </metadata>
</package>`,
  )
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
}

describe('normalizeImportSourceName', () => {
  it('returns basename with backslashes normalized', () => {
    expect(normalizeImportSourceName('folder/sub/book.epub')).toBe('book.epub')
    expect(normalizeImportSourceName('folder\\sub\\book.epub')).toBe('book.epub')
  })

  it('returns empty string for blank input', () => {
    expect(normalizeImportSourceName('')).toBe('')
    expect(normalizeImportSourceName('   ')).toBe('')
  })
})

describe('parseEpubMetadata', () => {
  it('reads title, author, and description from OPF', async () => {
    const buffer = await buildSampleEpub()
    const metadata = await parseEpubMetadata(buffer)
    expect(metadata.title).toBe('Sample Book Title')
    expect(metadata.author).toBe('Test Author')
    expect(metadata.description).toBe('A short description.')
  })
})
