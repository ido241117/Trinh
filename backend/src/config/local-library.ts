function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const LOCAL_LIBRARY_CONFIG = {
  dbName: process.env.LOCAL_LIBRARY_MONGODB_DB ?? 'Projectd_d3',
  collections: {
    hako: process.env.LOCAL_LIBRARY_HAKO_COLLECTION ?? 'books_hako',
    epub: process.env.LOCAL_LIBRARY_EPUB_COLLECTION ?? 'books_epub',
    pdf: process.env.LOCAL_LIBRARY_PDF_COLLECTION ?? 'books_pdf',
  },
  imgDir: requireEnv('OFFLINE_IMG_DIR'),
  /** Hako EPUB root — typically `D:\Data\Book`. */
  hakoBookDir: requireEnv('OFFLINE_EPUB_DIR'),
  /**
   * Text-only EPUB mirror (images stripped). Same filenames as hakoBookDir.
   * Used for fast first paint; full file upgrades in the background.
   */
  hakoBookNopictureDir: process.env.OFFLINE_EPUB_NOPICTURE_DIR?.trim() || '',
  /** Import EPUB/PDF root — typically `D:\Data\Import`. */
  importDir: requireEnv('OFFLINE_IMPORT_DIR'),
} as const

export function resolveHakoBookDir(): string {
  return LOCAL_LIBRARY_CONFIG.hakoBookDir
}

export function resolveImportDir(): string {
  return LOCAL_LIBRARY_CONFIG.importDir
}

export function listAllowedLibraryRoots(): string[] {
  const roots = new Set<string>([
    LOCAL_LIBRARY_CONFIG.hakoBookDir,
    LOCAL_LIBRARY_CONFIG.importDir,
    LOCAL_LIBRARY_CONFIG.imgDir,
  ])

  if (LOCAL_LIBRARY_CONFIG.hakoBookNopictureDir) {
    roots.add(LOCAL_LIBRARY_CONFIG.hakoBookNopictureDir)
  }

  return [...roots]
}
