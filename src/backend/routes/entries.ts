import express from 'express'
import { getDb } from '../db/database.js'
import { parseId } from '../utils/parse-id.js'
import { nowIso } from '../utils/now.js'
import { serializeEntry, EPOCH, type RawEntry } from '../utils/serialize.js'
import type { NewEntry, UpdateEntry } from '../types/index.js'

const router = express.Router()

const UPDATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

router.get('/users/:userId/entries', (req, res) => {
  const userId = parseId(req.params.userId)
  if (userId === null) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND deleted = 0').get(userId)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const entries = db
    .prepare('SELECT * FROM entries WHERE user_id = ? AND deleted = 0 ORDER BY timestamp DESC')
    .all(userId) as RawEntry[]
  res.json(entries.map(serializeEntry))
})

router.post('/users/:userId/entries', (req, res) => {
  const userId = parseId(req.params.userId)
  if (userId === null) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const db = getDb()
  const { timestamp, weight_kg } = req.body as NewEntry

  if (!timestamp || typeof timestamp !== 'string') {
    res.status(400).json({ error: 'Timestamp is required' })
    return
  }

  if (Number.isNaN(Date.parse(timestamp))) {
    res.status(400).json({ error: 'Timestamp must be a valid date' })
    return
  }

  if (typeof weight_kg !== 'number' || weight_kg <= 0) {
    res.status(400).json({ error: 'Weight must be a positive number' })
    return
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND deleted = 0').get(userId)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const stmt = db.prepare(
    'INSERT INTO entries (user_id, timestamp, weight_kg, updated_at) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(userId, timestamp, weight_kg, nowIso())
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid) as RawEntry
  res.status(201).json(serializeEntry(entry))
})

router.put('/entries/:id', (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }

  const db = getDb()
  const { timestamp, weight_kg, updated_at } = req.body as UpdateEntry

  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as RawEntry | undefined
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }

  const updates: string[] = []
  const values: (string | number)[] = []

  if (timestamp !== undefined) {
    if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
      res.status(400).json({ error: 'Timestamp must be a valid date' })
      return
    }
    updates.push('timestamp = ?')
    values.push(timestamp)
  }
  if (weight_kg !== undefined) {
    if (typeof weight_kg !== 'number' || weight_kg <= 0) {
      res.status(400).json({ error: 'Weight must be a positive number' })
      return
    }
    updates.push('weight_kg = ?')
    values.push(weight_kg)
  }

  if (updates.length === 0) {
    res.json(serializeEntry(existing))
    return
  }

  if (typeof updated_at !== 'string' || !UPDATED_AT_PATTERN.test(updated_at)) {
    res.status(400).json({ error: 'updated_at is required and must be an ISO-8601 UTC timestamp with millisecond precision' })
    return
  }

  const serverUpdatedAt = existing.updated_at ?? EPOCH
  if (serverUpdatedAt > updated_at) {
    res.status(409).json({ error: 'conflict', row: serializeEntry(existing) })
    return
  }

  updates.push('updated_at = ?')
  values.push(nowIso())

  values.push(id)
  db.prepare(`UPDATE entries SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as RawEntry
  res.json(serializeEntry(entry))
})

router.delete('/entries/:id', (req, res) => {
  const id = parseId(req.params.id)
  if (id === null) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }

  const db = getDb()
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as RawEntry | undefined
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }

  const observed = req.query.updated_at
  if (observed !== undefined) {
    if (typeof observed !== 'string' || !UPDATED_AT_PATTERN.test(observed)) {
      res.status(400).json({ error: 'updated_at must be an ISO-8601 UTC timestamp with millisecond precision' })
      return
    }
    const serverUpdatedAt = existing.updated_at ?? EPOCH
    if (existing.deleted === 1 && observed >= serverUpdatedAt) {
      res.status(204).send()
      return
    }
    if (serverUpdatedAt > observed) {
      res.status(409).json({ error: 'conflict', row: serializeEntry(existing) })
      return
    }
  }

  db.prepare('UPDATE entries SET deleted = 1, updated_at = ? WHERE id = ?').run(nowIso(), id)
  res.status(204).send()
})

export default router
