import 'dotenv/config'
import { createApp } from './app.js'
import { connectDb } from './db.js'
import { refreshStorageMounts } from './config/local-library.js'

const PORT = process.env.PORT ?? 2108

connectDb()
  .then(() => {
    console.log('MongoDB connected')
    const app = createApp()
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`)
    })

    // Discover Google Drive cold-storage mounts in the background. Non-fatal:
    // if a drive isn't mounted yet, the rest of the app keeps working and the
    // scan is retried lazily when a cold-storage book is opened.
    void refreshStorageMounts()
      .then(status => {
        console.log(
          `Cold storage mounted: ${status.mounted.length ? status.mounted.join(', ') : '(none)'}`
          + (status.missing.length ? ` | missing: ${status.missing.join(', ')}` : ''),
        )
      })
      .catch(err => {
        console.warn('Cold storage discovery failed:', err instanceof Error ? err.message : err)
      })
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message)
    console.error('Start MongoDB with: mongod')
    process.exit(1)
  })
