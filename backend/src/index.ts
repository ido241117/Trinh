import 'dotenv/config'
import { createApp } from './app.js'
import { connectDb } from './db.js'

const PORT = process.env.PORT ?? 2108

connectDb()
  .then(() => {
    console.log('MongoDB connected')
    const app = createApp()
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message)
    console.error('Start MongoDB with: mongod')
    process.exit(1)
  })
