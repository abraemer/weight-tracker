import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { setupTestApp, teardownTestDb } from '../test-helper.js'

const UPDATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const EPOCH = '1970-01-01T00:00:00.000Z'

describe('User Routes', () => {
  let app: express.Application
  let db: import('better-sqlite3').Database

  beforeEach(async () => {
    const setup = await setupTestApp()
    app = setup.app
    db = setup.db
  })

  afterEach(() => {
    teardownTestDb()
  })

  describe('GET /api/users', () => {
    it('returns empty array when no users exist', async () => {
      const res = await request(app).get('/api/users')
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('returns all users ordered by created_at', async () => {
      db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')
      db.prepare('INSERT INTO users (name) VALUES (?)').run('Bob')

      const res = await request(app).get('/api/users')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].name).toBe('Alice')
      expect(res.body[1].name).toBe('Bob')
    })

    it('excludes tombstoned users from the list', async () => {
      const alice = db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')
      db.prepare('INSERT INTO users (name) VALUES (?)').run('Bob')
      db.prepare('UPDATE users SET deleted = 1, updated_at = ? WHERE id = ?').run(
        '2026-01-01T00:00:00.000Z',
        alice.lastInsertRowid
      )

      const res = await request(app).get('/api/users')
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].name).toBe('Bob')
    })

    it('breaks created_at ties by id ascending', async () => {
      const tie = '2026-01-01 00:00:00'
      db.prepare('INSERT INTO users (name, created_at) VALUES (?, ?)').run('Zed', tie)
      db.prepare('INSERT INTO users (name, created_at) VALUES (?, ?)').run('Alpha', tie)

      const res = await request(app).get('/api/users')
      expect(res.status).toBe(200)
      expect(res.body.map((user: { name: string }) => user.name)).toEqual(['Zed', 'Alpha'])
    })
  })

  describe('GET /api/users/:id', () => {
    it('returns user by id', async () => {
      const result = db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')

      const res = await request(app).get(`/api/users/${result.lastInsertRowid}`)
      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Alice')
    })

    it('returns 404 when user not found', async () => {
      const res = await request(app).get('/api/users/999')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('returns 404 for a tombstoned user', async () => {
      const result = db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')
      db.prepare('UPDATE users SET deleted = 1, updated_at = ? WHERE id = ?').run(
        '2026-01-01T00:00:00.000Z',
        result.lastInsertRowid
      )

      const res = await request(app).get(`/api/users/${result.lastInsertRowid}`)
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })
  })

  describe('POST /api/users', () => {
    it('creates a new user', async () => {
      const res = await request(app).post('/api/users').send({ name: 'Alice' })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('Alice')
      expect(res.body.id).toBeDefined()
      expect(res.body.created_at).toBeDefined()
    })

    it('stamps created users with a server updated_at and deleted=false', async () => {
      const res = await request(app).post('/api/users').send({ name: 'Alice' })

      expect(res.status).toBe(201)
      expect(res.body.updated_at).toMatch(UPDATED_AT_PATTERN)
      expect(res.body.updated_at > '2026-01-01T00:00:00.000Z').toBe(true)
      expect(res.body.deleted).toBe(false)

      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(res.body.id) as {
        updated_at: string | null
        deleted: number
      }
      expect(row.updated_at).toBe(res.body.updated_at)
      expect(row.deleted).toBe(0)
    })

    it('trims whitespace from name', async () => {
      const res = await request(app).post('/api/users').send({ name: '  Alice  ' })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('Alice')
    })

    it('returns 400 when name is missing', async () => {
      const res = await request(app).post('/api/users').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Name is required and must be non-empty')
    })

    it('returns 400 when name is empty string', async () => {
      const res = await request(app).post('/api/users').send({ name: '' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Name is required and must be non-empty')
    })

    it('returns 400 when name is whitespace only', async () => {
      const res = await request(app).post('/api/users').send({ name: '   ' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Name is required and must be non-empty')
    })

    it('returns 400 when name is not a string', async () => {
      const res = await request(app).post('/api/users').send({ name: 123 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Name is required and must be non-empty')
    })
  })

  describe('DELETE /api/users/:id', () => {
    let userId: number

    beforeEach(() => {
      const result = db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')
      userId = result.lastInsertRowid as number
      for (const kg of [80.5, 81.0, 79.5]) {
        db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
          userId,
          '2026-01-01 08:00:00',
          kg
        )
      }
    })

    it('tombstones the user and all their entries in one transaction', async () => {
      const res = await request(app).delete(`/api/users/${userId}`)
      expect(res.status).toBe(204)

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
        deleted: number
        updated_at: string
      }
      expect(user).toBeDefined()
      expect(user.deleted).toBe(1)
      expect(user.updated_at).toMatch(UPDATED_AT_PATTERN)

      const liveEntries = db
        .prepare('SELECT * FROM entries WHERE user_id = ? AND deleted = 0')
        .all(userId)
      expect(liveEntries).toEqual([])

      const tombstonedEntries = db
        .prepare('SELECT * FROM entries WHERE user_id = ? AND deleted = 1')
        .all(userId) as { id: number; updated_at: string }[]
      expect(tombstonedEntries).toHaveLength(3)
      for (const row of tombstonedEntries) {
        expect(row.updated_at).toBe(user.updated_at)
      }

      const list = await request(app).get('/api/users')
      expect(list.status).toBe(200)
      expect(list.body).toEqual([])

      const single = await request(app).get(`/api/users/${userId}`)
      expect(single.status).toBe(404)
    })

    it('rolls back both updates when the entries update fails mid-transaction', async () => {
      const originalPrepare = db.prepare.bind(db)
      const spy = vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE entries')) {
          throw new Error('forced entries update failure')
        }
        return originalPrepare(sql)
      })

      const res = await request(app).delete(`/api/users/${userId}`)
      spy.mockRestore()

      expect(res.status).toBe(500)

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
        deleted: number
        updated_at: string | null
      }
      expect(user.deleted).toBe(0)
      expect(user.updated_at).toBeNull()

      const liveEntries = db
        .prepare('SELECT * FROM entries WHERE user_id = ? AND deleted = 0')
        .all(userId)
      expect(liveEntries).toHaveLength(3)
    })

    it('returns 409 with the server row when the observed updated_at is stale', async () => {
      db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(
        '2026-06-01T00:00:00.000Z',
        userId
      )

      const res = await request(app).delete(
        `/api/users/${userId}?updated_at=2020-01-01T00:00:00.000Z`
      )

      expect(res.status).toBe(409)
      expect(res.body.error).toBe('conflict')
      expect(res.body.row.id).toBe(userId)
      expect(res.body.row.updated_at).toBe('2026-06-01T00:00:00.000Z')
      expect(res.body.row.deleted).toBe(false)

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
        deleted: number
      }
      expect(user.deleted).toBe(0)

      const liveEntries = db
        .prepare('SELECT * FROM entries WHERE user_id = ? AND deleted = 0')
        .all(userId)
      expect(liveEntries).toHaveLength(3)
    })

    it('returns 400 for a garbage updated_at query param', async () => {
      const res = await request(app).delete(`/api/users/${userId}?updated_at=garbage`)

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
        deleted: number
      }
      expect(user.deleted).toBe(0)
    })

    it('returns 204 for an already-tombstoned user with current observed updated_at without re-stamping', async () => {
      const first = await request(app).delete(`/api/users/${userId}?updated_at=${EPOCH}`)
      expect(first.status).toBe(204)

      const tombstoned = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
        deleted: number
        updated_at: string
      }
      expect(tombstoned.deleted).toBe(1)

      const second = await request(app).delete(
        `/api/users/${userId}?updated_at=${encodeURIComponent(tombstoned.updated_at)}`
      )
      expect(second.status).toBe(204)

      const after = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as {
        updated_at: string
      }
      expect(after.updated_at).toBe(tombstoned.updated_at)
    })

    it('returns 404 when user not found', async () => {
      const res = await request(app).delete('/api/users/999')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('returns 404 when id is not a number', async () => {
      const res = await request(app).delete('/api/users/abc')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('GET with non-numeric id returns 404', async () => {
      const res = await request(app).get('/api/users/abc')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })
  })
})
