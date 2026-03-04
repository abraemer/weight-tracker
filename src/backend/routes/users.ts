import express from 'express'
import { getDb } from '../db/database.js'
import type { User, NewUser } from '../types/index.js'

const router = express.Router()

router.get('/', (_req, res) => {
  const db = getDb()
  const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as User[]
  res.json(users)
})

router.get('/:id', (req, res) => {
  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as User | undefined
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json(user)
})

router.post('/', (req, res) => {
  const db = getDb()
  const { name } = req.body as NewUser
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'Name is required and must be non-empty' })
    return
  }
  const stmt = db.prepare('INSERT INTO users (name) VALUES (?)')
  const result = stmt.run(name.trim())
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User
  res.status(201).json(user)
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id, 10)

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  db.prepare('DELETE FROM entries WHERE user_id = ?').run(id)
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  res.status(204).send()
})

export default router
