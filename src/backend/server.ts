import express from 'express'
import cors from 'cors'
import usersRouter from './routes/users.js'
import entriesRouter from './routes/entries.js'

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.use('/api/users', usersRouter)
app.use('/api', entriesRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})

export default app
