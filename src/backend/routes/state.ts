import express from 'express'
import { getDb } from '../db/database.js'
import { serializeUser, serializeEntry, type RawUser, type RawEntry } from '../utils/serialize.js'

const router = express.Router()

router.get('/state', (_req, res) => {
  const db = getDb()
  const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC, id ASC').all() as RawUser[]
  const entries = db.prepare('SELECT * FROM entries ORDER BY id ASC').all() as RawEntry[]
  res.set('Cache-Control', 'no-store')
  res.json({ users: users.map(serializeUser), entries: entries.map(serializeEntry) })
})

export default router
