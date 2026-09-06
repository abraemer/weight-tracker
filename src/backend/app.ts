import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import usersRouter from './routes/users.js'
import entriesRouter from './routes/entries.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function createApp(): express.Express {
  const app = express()
  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction) {
    app.use(cors())
  }

  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/users', usersRouter)
  app.use('/api', entriesRouter)

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  if (isProduction) {
    const frontendPath = path.join(__dirname, '..', 'frontend')
    app.use(express.static(frontendPath))
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'))
    })
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err.stack)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
