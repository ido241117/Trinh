import { Router } from 'express'
import { getWatchlistCollection } from '../models/watchlist.model.js'
import { fetchYoutubeLinkMetadata } from '../services/youtube-service.js'
import type { WatchlistItemDTO } from '../types.js'

function toDTO(doc: { _id: string; videoId: string; url: string; title: string; thumbnailUrl: string; savedAt: string }): WatchlistItemDTO {
    return {
        id: doc._id,
        videoId: doc.videoId,
        url: doc.url,
        title: doc.title,
        thumbnailUrl: doc.thumbnailUrl,
        savedAt: doc.savedAt,
    }
}

export function createWatchlistRouter(): Router {
    const router = Router()

    // GET /api/watchlist
    router.get('/', async (_req, res) => {
        try {
            const col = await getWatchlistCollection()
            const docs = await col.find({}).sort({ savedAt: -1 }).toArray()
            res.json(docs.map(toDTO))
        } catch (_err) {
            res.status(500).json({ error: 'Internal server error' })
        }
    })

    // POST /api/watchlist
    router.post('/', async (req, res) => {
        const { url } = req.body ?? {}

        if (!url || typeof url !== 'string') {
            res.status(400).json({ error: 'url is required' })
            return
        }

        try {
            const col = await getWatchlistCollection()

            // Fetch metadata from YouTube (with fallbacks)
            const metadata = await fetchYoutubeLinkMetadata(url)
            if (!metadata) {
                res.status(400).json({ error: 'Invalid YouTube URL' })
                return
            }

            // Check duplicate
            const existing = await col.findOne({ _id: metadata.videoId } as any)
            if (existing) {
                res.status(409).json({ error: 'Link này đã được lưu rồi' })
                return
            }

            const doc = {
                _id: metadata.videoId,
                videoId: metadata.videoId,
                url,
                title: metadata.title,
                thumbnailUrl: metadata.thumbnailUrl,
                savedAt: new Date().toISOString(),
            }

            await col.insertOne(doc as any)
            res.status(201).json(toDTO(doc))
        } catch (_err) {
            res.status(500).json({ error: 'Internal server error' })
        }
    })

    // DELETE /api/watchlist/:id  (id = videoId string)
    router.delete('/:id', async (req, res) => {
        const { id } = req.params
        try {
            const col = await getWatchlistCollection()
            const result = await col.deleteOne({ _id: id } as any)
            if (result.deletedCount === 0) {
                res.status(404).json({ error: 'Not found' })
                return
            }
            res.json({ success: true })
        } catch (_err) {
            res.status(500).json({ error: 'Internal server error' })
        }
    })

    return router
}
