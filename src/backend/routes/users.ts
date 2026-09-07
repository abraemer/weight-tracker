import express from 'express'
import { getDb } from '../db/database.js'
import { parseId } from '../utils/parse-id.js'
import { nowIso } from '../utils/now.js'
import { serializeUser, EPOCH, type RawUser } from '../utils/serialize.js'
import type { NewUser } from '../types/index.js'

const router = express.Router()

const UPDATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

router.get('/', (_req, res) => {
  const db = getDb()
  const users = db
    .prepare('SELECT * FROM users WHERE deleted = 0 ORDER BY created_at ASC, id ASC')
    .all() as RawUser[]
  res.json(users.map(serializeUser))
})

router.get('/:id', (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND deleted = 0').get(id) as
    | RawUser
    | undefined
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json(serializeUser(user))
})

router.post('/', (req, res) => {
  const db = getDb()
  const { name } = req.body as NewUser
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'Name is required and must be non-empty' })
    return
  }
  const stmt = db.prepare('INSERT INTO users (name, updated_at) VALUES (?, ?)')
  const result = stmt.run(name.trim(), nowIso())
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as RawUser
  res.status(201).json(serializeUser(user))
})

router.delete('/:id', (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const db = getDb()

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as RawUser | undefined
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const observed = req.query.updated_at
  if (observed !== undefined) {
    if (typeof observed !== 'string' || !UPDATED_AT_PATTERN.test(observed)) {
      res.status(400).json({ error: 'updated_at must be an ISO-8601 UTC timestamp with millisecond precision' })
      return
    }
    const serverUpdatedAt = user.updated_at ?? EPOCH
    if (user.deleted === 1 && observed >= serverUpdatedAt) {
      res.status(204).send()
      return
    }
    if (serverUpdatedAt > observed) {
      res.status(409).json({ error: 'conflict', row: serializeUser(user) })
      return
    }
  }

  const stamp = nowIso()
  db.transaction(() => {
    db.prepare('UPDATE users SET deleted = 1, updated_at = ? WHERE id = ?').run(stamp, id)
    db.prepare('UPDATE entries SET deleted = 1, updated_at = ? WHERE user_id = ?').run(stamp, id)
  })()
  res.status(204).send()
})

export default router
