import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { setupTestApp, teardownTestDb } from '../test-helper.js'

const UPDATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const EPOCH = '1970-01-01T00:00:00.000Z'

describe('Entry Routes', () => {
  let app: express.Application
  let db: import('better-sqlite3').Database
  let userId: number

  beforeEach(async () => {
    const setup = await setupTestApp()
    app = setup.app
    db = setup.db

    const result = db.prepare('INSERT INTO users (name) VALUES (?)').run('Test User')
    userId = result.lastInsertRowid as number
  })

  afterEach(() => {
    teardownTestDb()
  })

  describe('GET /api/users/:userId/entries', () => {
    it('returns empty array when no entries exist', async () => {
      const res = await request(app).get(`/api/users/${userId}/entries`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('returns entries for a user ordered by timestamp descending', async () => {
      db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
        userId,
        '2024-01-01T10:00:00Z',
        70.5
      )
      db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
        userId,
        '2024-01-02T10:00:00Z',
        71.0
      )

      const res = await request(app).get(`/api/users/${userId}/entries`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].timestamp).toBe('2024-01-02T10:00:00Z')
      expect(res.body[1].timestamp).toBe('2024-01-01T10:00:00Z')
    })

    it('returns only entries for the specified user', async () => {
      const otherUser = db.prepare('INSERT INTO users (name) VALUES (?)').run('Other User')
      const otherUserId = otherUser.lastInsertRowid as number

      db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
        userId,
        '2024-01-01T10:00:00Z',
        70.5
      )
      db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
        otherUserId,
        '2024-01-02T10:00:00Z',
        80.0
      )

      const res = await request(app).get(`/api/users/${userId}/entries`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].weight_kg).toBe(70.5)
    })

    it('returns 404 when user does not exist', async () => {
      const res = await request(app).get('/api/users/999/entries')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('returns 404 when the user is tombstoned', async () => {
      db.prepare('UPDATE users SET deleted = 1, updated_at = ? WHERE id = ?').run(
        '2026-01-01T00:00:00.000Z',
        userId
      )

      const res = await request(app).get(`/api/users/${userId}/entries`)

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('returns 404 when userId is not a valid id', async () => {
      const res = await request(app).get('/api/users/abc/entries')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('excludes tombstoned rows while keeping timestamp DESC order', async () => {
      db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
        userId,
        '2024-01-01T10:00:00Z',
        70.5
      )
      db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
        userId,
        '2024-01-02T10:00:00Z',
        71.0
      )
      db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
        userId,
        '2024-01-03T10:00:00Z',
        72.0
      )
      db.prepare('UPDATE entries SET deleted = 1, updated_at = ? WHERE timestamp = ?').run(
        '2024-06-01T00:00:00.000Z',
        '2024-01-02T10:00:00Z'
      )

      const res = await request(app).get(`/api/users/${userId}/entries`)
      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(2)
      expect(res.body[0].timestamp).toBe('2024-01-03T10:00:00Z')
      expect(res.body[1].timestamp).toBe('2024-01-01T10:00:00Z')
    })

    it('serializes deleted as boolean and NULL updated_at as epoch', async () => {
      db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
        userId,
        '2024-01-01T10:00:00Z',
        70.5
      )

      const res = await request(app).get(`/api/users/${userId}/entries`)
      expect(res.status).toBe(200)
      expect(res.body[0].deleted).toBe(false)
      expect(res.body[0].updated_at).toBe(EPOCH)
    })
  })

  describe('POST /api/users/:userId/entries', () => {
    it('creates a new entry', async () => {
      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: 70.5 })

      expect(res.status).toBe(201)
      expect(res.body.timestamp).toBe('2024-01-01T10:00:00Z')
      expect(res.body.weight_kg).toBe(70.5)
      expect(res.body.user_id).toBe(userId)
      expect(res.body.id).toBeDefined()
    })

    it('stamps created entries with updated_at and deleted=false', async () => {
      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: 70.5 })

      expect(res.status).toBe(201)
      expect(res.body.updated_at).toMatch(UPDATED_AT_PATTERN)
      expect(res.body.deleted).toBe(false)

      const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(res.body.id) as {
        updated_at: string | null
        deleted: number
      }
      expect(row.updated_at).toBe(res.body.updated_at)
      expect(row.deleted).toBe(0)
    })

    it('allows duplicate entries at same timestamp', async () => {
      await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: 70.5 })

      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: 71.0 })

      expect(res.status).toBe(201)
      expect(res.body.weight_kg).toBe(71.0)

      const entries = db.prepare('SELECT * FROM entries WHERE user_id = ?').all(userId)
      expect(entries).toHaveLength(2)
    })

    it('returns 404 when user does not exist', async () => {
      const res = await request(app)
        .post('/api/users/999/entries')
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: 70.5 })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('returns 404 when the user is tombstoned', async () => {
      db.prepare('UPDATE users SET deleted = 1, updated_at = ? WHERE id = ?').run(
        '2026-01-01T00:00:00.000Z',
        userId
      )

      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: 70.5 })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('returns 404 when userId is not a valid id', async () => {
      const res = await request(app)
        .post('/api/users/abc/entries')
        .send({ timestamp: '2026-01-01T08:00:00Z', weight_kg: 70 })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('returns 400 when timestamp is missing', async () => {
      const res = await request(app).post(`/api/users/${userId}/entries`).send({ weight_kg: 70.5 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Timestamp is required')
    })

    it('returns 400 when timestamp is not a string', async () => {
      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: 123, weight_kg: 70.5 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Timestamp is required')
    })

    it('returns 400 when timestamp is not a valid date', async () => {
      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: 'banana', weight_kg: 70 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Timestamp must be a valid date')
    })

    it('returns 400 when weight_kg is missing', async () => {
      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Weight must be a positive number')
    })

    it('returns 400 when weight_kg is zero', async () => {
      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: 0 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Weight must be a positive number')
    })

    it('returns 400 when weight_kg is negative', async () => {
      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: -5 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Weight must be a positive number')
    })

    it('returns 400 when weight_kg is not a number', async () => {
      const res = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: 'heavy' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Weight must be a positive number')
    })
  })

  describe('PUT /api/entries/:id', () => {
    let entryId: number

    beforeEach(() => {
      const result = db
        .prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)')
        .run(userId, '2024-01-01T10:00:00Z', 70.5)
      entryId = result.lastInsertRowid as number
    })

    it('updates an entry timestamp', async () => {
      const res = await request(app)
        .put(`/api/entries/${entryId}`)
        .send({ timestamp: '2024-01-02T12:00:00Z', updated_at: EPOCH })

      expect(res.status).toBe(200)
      expect(res.body.timestamp).toBe('2024-01-02T12:00:00Z')
      expect(res.body.weight_kg).toBe(70.5)
    })

    it('updates an entry weight', async () => {
      const res = await request(app)
        .put(`/api/entries/${entryId}`)
        .send({ weight_kg: 72.0, updated_at: EPOCH })

      expect(res.status).toBe(200)
      expect(res.body.weight_kg).toBe(72.0)
      expect(res.body.timestamp).toBe('2024-01-01T10:00:00Z')
    })

    it('updates both timestamp and weight', async () => {
      const res = await request(app)
        .put(`/api/entries/${entryId}`)
        .send({ timestamp: '2024-01-03T08:00:00Z', weight_kg: 73.0, updated_at: EPOCH })

      expect(res.status).toBe(200)
      expect(res.body.timestamp).toBe('2024-01-03T08:00:00Z')
      expect(res.body.weight_kg).toBe(73.0)
    })

    it('returns existing entry when no updates provided', async () => {
      const res = await request(app).put(`/api/entries/${entryId}`).send({})

      expect(res.status).toBe(200)
      expect(res.body.weight_kg).toBe(70.5)
    })

    it('does not bump updated_at on the empty-body no-op', async () => {
      const created = await request(app)
        .post(`/api/users/${userId}/entries`)
        .send({ timestamp: '2024-01-01T10:00:00Z', weight_kg: 70.5 })

      const res = await request(app).put(`/api/entries/${created.body.id}`).send({})

      expect(res.status).toBe(200)
      expect(res.body.weight_kg).toBe(70.5)
      expect(res.body.updated_at).toBe(created.body.updated_at)
    })

    it('bumps updated_at and echoes the new row on a fresh edit round-trip', async () => {
      db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(
        '2020-01-01T00:00:00.000Z',
        entryId
      )

      const res = await request(app)
        .put(`/api/entries/${entryId}`)
        .send({ weight_kg: 75.0, updated_at: '2020-01-01T00:00:00.000Z' })

      expect(res.status).toBe(200)
      expect(res.body.weight_kg).toBe(75.0)
      expect(res.body.timestamp).toBe('2024-01-01T10:00:00Z')
      expect(res.body.updated_at).toMatch(UPDATED_AT_PATTERN)
      expect(res.body.updated_at > '2020-01-01T00:00:00.000Z').toBe(true)
      expect(res.body.deleted).toBe(false)
    })

    it('returns 409 with the server row when the observed updated_at is stale', async () => {
      db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(
        '2024-06-01T00:00:00.000Z',
        entryId
      )

      const res = await request(app)
        .put(`/api/entries/${entryId}`)
        .send({ weight_kg: 75.0, updated_at: '2020-01-01T00:00:00.000Z' })

      expect(res.status).toBe(409)
      expect(res.body.error).toBe('conflict')
      expect(res.body.row.updated_at).toBe('2024-06-01T00:00:00.000Z')
      expect(res.body.row.updated_at > '2020-01-01T00:00:00.000Z').toBe(true)
      expect(res.body.row.weight_kg).toBe(70.5)

      const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as {
        weight_kg: number
      }
      expect(row.weight_kg).toBe(70.5)
    })

    it('returns 400 when updated_at is missing alongside field updates', async () => {
      const res = await request(app).put(`/api/entries/${entryId}`).send({ weight_kg: 75.0 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })

    it('returns 400 when updated_at is not ms-precision ISO-8601 UTC', async () => {
      const invalid = [
        'not-a-date',
        '',
        '2024-01-01T00:00:00Z',
        '2024-01-01T00:00:00.000+00:00',
        123,
      ]

      for (const updated_at of invalid) {
        const res = await request(app)
          .put(`/api/entries/${entryId}`)
          .send({ weight_kg: 75.0, updated_at })
        expect(res.status).toBe(400)
        expect(res.body.error).toBeDefined()
      }

      const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as {
        weight_kg: number
      }
      expect(row.weight_kg).toBe(70.5)
    })

    it('ignores unknown body fields', async () => {
      const res = await request(app)
        .put(`/api/entries/${entryId}`)
        .send({ weight_kg: 75.0, updated_at: EPOCH, extra: 'ignored' })

      expect(res.status).toBe(200)
      expect(res.body.weight_kg).toBe(75.0)
    })

    it('treats a NULL updated_at row as epoch on PUT (legacy write)', async () => {
      const res = await request(app)
        .put(`/api/entries/${entryId}`)
        .send({ weight_kg: 71.0, updated_at: EPOCH })

      expect(res.status).toBe(200)
      expect(res.body.weight_kg).toBe(71.0)
      expect(res.body.updated_at).toMatch(UPDATED_AT_PATTERN)
    })

    it('an edit against a tombstoned row loses with 409 and the tombstone row', async () => {
      const del = await request(app)
        .delete(`/api/entries/${entryId}?updated_at=${EPOCH}`)
      expect(del.status).toBe(204)

      const res = await request(app)
        .put(`/api/entries/${entryId}`)
        .send({ weight_kg: 75.0, updated_at: '2020-01-01T00:00:00.000Z' })

      expect(res.status).toBe(409)
      expect(res.body.error).toBe('conflict')
      expect(res.body.row.deleted).toBe(true)
      expect(res.body.row.updated_at > '2020-01-01T00:00:00.000Z').toBe(true)
    })

    it('returns 404 when entry does not exist', async () => {
      const res = await request(app).put('/api/entries/999').send({ weight_kg: 72.0 })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Entry not found')
    })

    it('returns 404 when id is not a valid id', async () => {
      const res = await request(app).put('/api/entries/abc').send({ weight_kg: 72.0 })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Entry not found')
    })

    it('returns 400 when timestamp is not a string', async () => {
      const res = await request(app).put(`/api/entries/${entryId}`).send({ timestamp: 123 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Timestamp must be a valid date')
    })

    it('returns 400 when timestamp is not a valid date', async () => {
      const res = await request(app).put(`/api/entries/${entryId}`).send({ timestamp: 'banana' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Timestamp must be a valid date')
    })

    it('returns 400 when weight_kg is zero', async () => {
      const res = await request(app).put(`/api/entries/${entryId}`).send({ weight_kg: 0 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Weight must be a positive number')
    })

    it('returns 400 when weight_kg is negative', async () => {
      const res = await request(app).put(`/api/entries/${entryId}`).send({ weight_kg: -5 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Weight must be a positive number')
    })

    it('returns 400 when weight_kg is not a number', async () => {
      const res = await request(app).put(`/api/entries/${entryId}`).send({ weight_kg: 'heavy' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Weight must be a positive number')
    })
  })

  describe('DELETE /api/entries/:id', () => {
    let entryId: number

    beforeEach(() => {
      const result = db
        .prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)')
        .run(userId, '2024-01-01T10:00:00Z', 70.5)
      entryId = result.lastInsertRowid as number
    })

    it('tombstones an entry instead of removing it', async () => {
      const res = await request(app).delete(`/api/entries/${entryId}`)
      expect(res.status).toBe(204)

      const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as {
        deleted: number
        updated_at: string | null
      }
      expect(row).toBeDefined()
      expect(row.deleted).toBe(1)
      expect(row.updated_at).toMatch(UPDATED_AT_PATTERN)
    })

    it('DELETE with stale observed updated_at returns 409 and leaves the row live', async () => {
      db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(
        '2024-06-01T00:00:00.000Z',
        entryId
      )

      const res = await request(app).delete(
        `/api/entries/${entryId}?updated_at=2020-01-01T00:00:00.000Z`
      )

      expect(res.status).toBe(409)
      expect(res.body.error).toBe('conflict')
      expect(res.body.row.updated_at).toBe('2024-06-01T00:00:00.000Z')
      expect(res.body.row.deleted).toBe(false)

      const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as {
        deleted: number
      }
      expect(row.deleted).toBe(0)
    })

    it('DELETE of an already-tombstoned row with current observed returns 204 without re-stamping', async () => {
      const first = await request(app).delete(`/api/entries/${entryId}?updated_at=${EPOCH}`)
      expect(first.status).toBe(204)

      const tombstoned = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as {
        deleted: number
        updated_at: string
      }
      expect(tombstoned.deleted).toBe(1)

      const second = await request(app).delete(
        `/api/entries/${entryId}?updated_at=${encodeURIComponent(tombstoned.updated_at)}`
      )
      expect(second.status).toBe(204)

      const after = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as {
        updated_at: string
      }
      expect(after.updated_at).toBe(tombstoned.updated_at)
    })

    it('DELETE with a garbage updated_at query param returns 400', async () => {
      const res = await request(app).delete(`/api/entries/${entryId}?updated_at=garbage`)

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()

      const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as {
        deleted: number
      }
      expect(row.deleted).toBe(0)
    })

    it('returns 404 when entry does not exist', async () => {
      const res = await request(app).delete('/api/entries/999')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Entry not found')
    })

    it('returns 404 when id is not a valid id', async () => {
      const res = await request(app).delete('/api/entries/abc')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Entry not found')
    })
  })
})
