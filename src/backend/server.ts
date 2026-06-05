import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import usersRouter from './routes/users.js'
import entriesRouter from './routes/entries.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 3000
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})

export default app
