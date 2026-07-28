import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMusicRouter } from './routes/music.js'
import { createYtdlpRouter } from './routes/ytdlp.js'
import { createWatchlistRouter } from './routes/watchlist.js'
import { createJournalRouter } from './routes/journal.js'
import { createLocalLibraryRouter } from './routes/local-library.js'
import { createAiQuotaRouter } from './routes/ai-quota.js'
import { createDashboardRouter } from './routes/dashboard.js'
import { LOCAL_LIBRARY_CONFIG } from './config/local-library.js'
import { MUSIC_CONFIG } from './config/music.js'
import { JOURNAL_CONFIG } from './config/journal.js'
import { AI_QUOTA_CONFIG } from './config/ai-quota.js'
import { DASHBOARD_CONFIG } from './config/dashboard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultFrontendDist = path.resolve(__dirname, '../../frontend/dist')

export function createApp() {
  const app = express()
  const musicFolder = MUSIC_CONFIG.folder
  const imgDir = MUSIC_CONFIG.coverDir
  const frontendDist = process.env.FRONTEND_DIST ?? defaultFrontendDist

  // LAN app: allow any origin (same host, Tailscale IP, Vite dev proxy, etc.)
  app.use(cors({ origin: true }))
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api', createMusicRouter(musicFolder, imgDir))
  app.use('/api/ytdlp', createYtdlpRouter(musicFolder, imgDir))
  app.use('/api/watchlist', createWatchlistRouter())
  app.use('/api/local-library', createLocalLibraryRouter(LOCAL_LIBRARY_CONFIG.imgDir))
  app.use('/api/journal', createJournalRouter(JOURNAL_CONFIG.attachmentDir))
  app.use('/api/ai-quota', createAiQuotaRouter(AI_QUOTA_CONFIG.iconDir))
  app.use('/api/dashboard', createDashboardRouter(DASHBOARD_CONFIG.backgroundDir))

  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist))
    app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'))
    })
  }

  return app
}
