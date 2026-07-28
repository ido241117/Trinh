/**
 * Compare D:\Data\*.epub with Projectd_d3.books_hako, then stress-test
 * book-read-service zip/read paths + copy/move of large payloads without
 * mutating the originals.
 *
 * Usage:
 *   npx tsx scripts/compare-hako-epubs.mts
 *   npx tsx scripts/compare-hako-epubs.mts --compare-only
 *   npx tsx scripts/compare-hako-epubs.mts --limit 50
 *   npx tsx scripts/compare-hako-epubs.mts --concurrency 2
 */
import dotenv from 'dotenv'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import JSZip from 'jszip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const EPUB_DIR = process.env.EPUB_TEST_DIR?.trim() || 'D:\\Data'
// Service resolves hako files under OFFLINE_EPUB_DIR — point at the flat copy root.
process.env.OFFLINE_EPUB_DIR = EPUB_DIR
process.env.OFFLINE_IMPORT_DIR ||= path.join(path.dirname(EPUB_DIR), 'Import')
process.env.OFFLINE_IMG_DIR ||= path.join(path.dirname(EPUB_DIR), 'Book-cover')

const args = new Set(process.argv.slice(2))
const compareOnly = args.has('--compare-only')
const limitArg = process.argv.find(a => a.startsWith('--limit=')) ?? (
  process.argv.includes('--limit') ? `--limit=${process.argv[process.argv.indexOf('--limit') + 1]}` : null
)
const concurrencyArg = process.argv.find(a => a.startsWith('--concurrency=')) ?? (
  process.argv.includes('--concurrency')
    ? `--concurrency=${process.argv[process.argv.indexOf('--concurrency') + 1]}`
    : null
)
const LIMIT = limitArg ? Math.max(0, Number.parseInt(limitArg.split('=')[1]!, 10) || 0) : 0
const CONCURRENCY = Math.max(1, Number.parseInt(concurrencyArg?.split('=')[1] ?? '2', 10) || 2)

type HakoRow = {
  _id: { toHexString(): string }
  hakoId: string
  title?: string
  drive?: string | null
  sizeKb?: number | null
}

type Failure = {
  hakoId: string
  stage: string
  error: string
}

function listEpubBasenames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.epub'))
    .map(e => e.name)
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

async function main() {
  console.log(`EPUB dir: ${EPUB_DIR}`)
  console.log(`OFFLINE_EPUB_DIR override: ${process.env.OFFLINE_EPUB_DIR}`)

  const diskNames = listEpubBasenames(EPUB_DIR)
  const diskSet = new Set(diskNames.map(n => n.toLowerCase()))
  console.log(`Disk EPUB count: ${diskNames.length}`)

  const { connectDb, closeDb, getLocalLibraryDb } = await import('../src/db.js')
  await connectDb()

  const col = getLocalLibraryDb().collection<HakoRow>('books_hako')
  const mongoCount = await col.countDocuments()
  const docs = await col
    .find({}, { projection: { hakoId: 1, title: 1, drive: 1, sizeKb: 1 } })
    .toArray()

  const mongoById = new Map<string, HakoRow>()
  const dupHakoIds: string[] = []
  for (const doc of docs) {
    const key = doc.hakoId?.trim()
    if (!key) continue
    const lower = key.toLowerCase()
    if (mongoById.has(lower)) dupHakoIds.push(key)
    mongoById.set(lower, doc)
  }

  const mongoIds = [...mongoById.keys()]
  const missingOnDisk = mongoIds.filter(id => !diskSet.has(id))
  const orphanOnDisk = diskNames.filter(name => !mongoById.has(name.toLowerCase()))

  const driveGroups = new Map<string, number>()
  for (const doc of docs) {
    const key = doc.drive?.trim() || '(local/null)'
    driveGroups.set(key, (driveGroups.get(key) ?? 0) + 1)
  }

  console.log('\n=== Compare: disk ↔ MongoDB books_hako ===')
  console.log(`Mongo documents: ${mongoCount}`)
  console.log(`Mongo unique hakoId: ${mongoById.size}`)
  if (dupHakoIds.length) console.log(`Duplicate hakoId in Mongo: ${dupHakoIds.length}`)
  console.log(`Missing on disk (in Mongo, no file): ${missingOnDisk.length}`)
  console.log(`Orphan on disk (file, not in Mongo): ${orphanOnDisk.length}`)
  console.log('Drive breakdown:')
  for (const [drive, n] of [...driveGroups.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${drive}: ${n}`)
  }

  if (missingOnDisk.length) {
    console.log('\nSample missing on disk (up to 20):')
    for (const id of missingOnDisk.slice(0, 20)) console.log(`  - ${id}`)
  }
  if (orphanOnDisk.length) {
    console.log('\nSample orphan on disk (up to 20):')
    for (const name of orphanOnDisk.slice(0, 20)) console.log(`  - ${name}`)
  }

  const matched = diskNames
    .map(name => mongoById.get(name.toLowerCase()))
    .filter((d): d is HakoRow => Boolean(d))

  console.log(`\nMatched pairs: ${matched.length}`)

  const reportPath = path.join(__dirname, 'compare-hako-epubs-report.json')
  const compareReport = {
    epubDir: EPUB_DIR,
    diskCount: diskNames.length,
    mongoCount,
    mongoUniqueHakoId: mongoById.size,
    duplicateHakoIds: dupHakoIds,
    missingOnDisk,
    orphanOnDisk,
    matched: matched.length,
    driveGroups: Object.fromEntries(driveGroups),
    comparedAt: new Date().toISOString(),
  }
  writeFileSync(reportPath, JSON.stringify(compareReport, null, 2))
  console.log(`Wrote compare report: ${reportPath}`)

  if (compareOnly) {
    await closeDb()
    process.exitCode = missingOnDisk.length || orphanOnDisk.length ? 1 : 0
    return
  }

  // ── Stress test via book-read-service (+ copy/move/zip roundtrip) ─────────
  const {
    extractListChapterLinksFromEpubBuffer,
    openLocalLibraryFile,
    resolveLocalLibraryFilePath,
  } = await import('../src/services/book-read-service.js')
  const { toLocalLibraryItemId } = await import('../src/models/local-library.model.js')

  let targets = matched.filter(doc => !doc.drive?.trim()) // only local D: files under EPUB_DIR
  const skippedCold = matched.length - targets.length
  if (LIMIT > 0) targets = targets.slice(0, LIMIT)

  console.log('\n=== Stress test (service + copy/move/zip) ===')
  console.log(`Targets (local drive=null): ${targets.length}`)
  if (skippedCold) console.log(`Skipped cold-storage docs: ${skippedCold}`)
  console.log(`Concurrency: ${CONCURRENCY}`)

  const workRoot = path.join(tmpdir(), `hako-epub-stress-${Date.now()}`)
  mkdirSync(workRoot, { recursive: true })

  const failures: Failure[] = []
  let ok = 0
  let bytesRead = 0
  const started = Date.now()
  let done = 0

  await mapPool(targets, CONCURRENCY, async (doc) => {
    const hakoId = doc.hakoId
    const filePath = path.join(EPUB_DIR, hakoId)
    const stage = (name: string, err: unknown) => {
      failures.push({
        hakoId,
        stage: name,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    try {
      if (!existsSync(filePath)) {
        stage('exists', new Error('file missing'))
        return
      }

      const sizeBefore = statSync(filePath).size
      const hashBefore = await sha256File(filePath)

      // 1) Path resolution + open stream (service)
      const resolved = resolveLocalLibraryFilePath('hako', doc as never)
      if (!resolved || path.win32.normalize(resolved).toLowerCase() !== path.win32.normalize(filePath).toLowerCase()) {
        stage('resolveLocalLibraryFilePath', new Error(`resolved=${resolved}`))
        return
      }

      const opened = openLocalLibraryFile('hako', doc as never)
      await new Promise<void>((resolve, reject) => {
        let n = 0
        opened.stream.on('data', (chunk: Buffer) => { n += chunk.length })
        opened.stream.on('error', reject)
        opened.stream.on('end', () => {
          if (n !== sizeBefore) reject(new Error(`stream bytes ${n} != size ${sizeBefore}`))
          else resolve()
        })
      })

      // 2) TOC extract = JSZip.loadAsync on full buffer (service)
      const buffer = readFileSync(filePath)
      bytesRead += buffer.length
      const chapters = await extractListChapterLinksFromEpubBuffer(buffer)

      // 3) Copy large payload → load zip → pull entries → regenerate zip → move
      const bookWork = path.join(workRoot, path.parse(hakoId).name)
      mkdirSync(bookWork, { recursive: true })
      const copyPath = path.join(bookWork, 'copy.epub')
      const movedPath = path.join(bookWork, 'moved.epub')
      const regeneratedPath = path.join(bookWork, 'regenerated.epub')

      copyFileSync(filePath, copyPath)
      const copyHash = await sha256File(copyPath)
      if (copyHash !== hashBefore) {
        stage('copyFileSync', new Error('copy hash mismatch vs original'))
        return
      }

      renameSync(copyPath, movedPath)
      const movedHash = await sha256File(movedPath)
      if (movedHash !== hashBefore) {
        stage('renameSync/move', new Error('moved hash mismatch vs original'))
        return
      }

      const zip = await JSZip.loadAsync(readFileSync(movedPath))
      const entryNames = Object.keys(zip.files)
      if (!entryNames.length) {
        stage('JSZip.loadAsync', new Error('empty zip'))
        return
      }

      // Touch a few large entries to force decompress of heavy payloads
      const fileEntries = entryNames
        .filter(name => !zip.files[name]!.dir)
        .slice(0, 8)
      let extracted = 0
      for (const name of fileEntries) {
        const data = await zip.files[name]!.async('nodebuffer')
        extracted += data.length
      }

      const out = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 1 },
      })
      writeFileSync(regeneratedPath, out)

      // Regenerated may differ byte-for-byte (compression), but must still open
      const zip2 = await JSZip.loadAsync(readFileSync(regeneratedPath))
      if (!Object.keys(zip2.files).length) {
        stage('zip.generateAsync', new Error('regenerated zip empty'))
        return
      }

      // 4) Original must be untouched after all of the above
      const sizeAfter = statSync(filePath).size
      const hashAfter = await sha256File(filePath)
      if (sizeAfter !== sizeBefore || hashAfter !== hashBefore) {
        stage('original-integrity', new Error(
          `CORrupted original! size ${sizeBefore}->${sizeAfter} hash ${hashBefore}->${hashAfter}`,
        ))
        return
      }

      rmSync(bookWork, { recursive: true, force: true })
      ok += 1
      done += 1

      if (done % 100 === 0 || done === targets.length) {
        const elapsed = ((Date.now() - started) / 1000).toFixed(1)
        console.log(
          `  progress ${done}/${targets.length} ok=${ok} fail=${failures.length} ` +
          `chapters_last=${chapters.length} extracted=${formatBytes(extracted)} ` +
          `read=${formatBytes(bytesRead)} ${elapsed}s`,
        )
      }
    } catch (err) {
      stage('unexpected', err)
      done += 1
    }
  })

  await closeDb()

  const stressReport = {
    ...compareReport,
    stress: {
      targets: targets.length,
      skippedCold,
      concurrency: CONCURRENCY,
      ok,
      failed: failures.length,
      failures: failures.slice(0, 200),
      bytesRead,
      workRoot,
      elapsedMs: Date.now() - started,
      bookIdSample: targets[0]
        ? toLocalLibraryItemId('hako', targets[0]._id as never)
        : null,
    },
  }
  writeFileSync(reportPath, JSON.stringify(stressReport, null, 2))

  console.log('\n=== Result ===')
  console.log(`OK: ${ok}/${targets.length}`)
  console.log(`Failed: ${failures.length}`)
  console.log(`Data read through buffers: ${formatBytes(bytesRead)}`)
  console.log(`Report: ${reportPath}`)
  if (failures.length) {
    console.log('\nFailures (up to 30):')
    for (const f of failures.slice(0, 30)) {
      console.log(`  [${f.stage}] ${f.hakoId}: ${f.error}`)
    }
  }

  process.exitCode = failures.length || missingOnDisk.length || orphanOnDisk.length ? 1 : 0
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
