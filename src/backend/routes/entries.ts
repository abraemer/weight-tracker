import express from 'express'
import { getDb } from '../db/database.js'
import type { Entry, NewEntry, UpdateEntry } from '../types/index.js'

const router = express.Router()

router.get('/users/:userId/entries', (req, res) => {
  const db = getDb()
  const entries = db
    .prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY timestamp DESC')
    .all(req.params.userId) as Entry[]
  res.json(entries)
})

router.post('/users/:userId/entries', (req, res) => {
  const db = getDb()
  const { timestamp, weight_kg } = req.body as NewEntry
  const userId = parseInt(req.params.userId, 10)

  if (!timestamp || typeof timestamp !== 'string') {
    res.status(400).json({ error: 'Timestamp is required' })
    return
  }

  if (typeof weight_kg !== 'number' || weight_kg <= 0) {
    res.status(400).json({ error: 'Weight must be a positive number' })
    return
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const stmt = db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)')
  const result = stmt.run(userId, timestamp, weight_kg)
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid) as Entry
  res.status(201).json(entry)
})

router.put('/entries/:id', (req, res) => {
  const db = getDb()
  const { timestamp, weight_kg } = req.body as UpdateEntry
  const id = parseInt(req.params.id, 10)

  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry | undefined
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }

  const updates: string[] = []
  const values: (string | number)[] = []

  if (timestamp !== undefined) {
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
    res.json(existing)
    return
  }

  values.push(id)
  db.prepare(`UPDATE entries SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry
  res.json(entry)
})

router.delete('/entries/:id', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id, 10)
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id)
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' })
    return
  }
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
  res.status(204).send()
})

export default router
