import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { setupTestApp, teardownTestDb } from '../test-helper.js'

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

    it('returns 404 when userId is not a valid id', async () => {
      const res = await request(app).get('/api/users/abc/entries')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
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
        .send({ timestamp: '2024-01-02T12:00:00Z' })

      expect(res.status).toBe(200)
      expect(res.body.timestamp).toBe('2024-01-02T12:00:00Z')
      expect(res.body.weight_kg).toBe(70.5)
    })

    it('updates an entry weight', async () => {
      const res = await request(app).put(`/api/entries/${entryId}`).send({ weight_kg: 72.0 })

      expect(res.status).toBe(200)
      expect(res.body.weight_kg).toBe(72.0)
      expect(res.body.timestamp).toBe('2024-01-01T10:00:00Z')
    })

    it('updates both timestamp and weight', async () => {
      const res = await request(app)
        .put(`/api/entries/${entryId}`)
        .send({ timestamp: '2024-01-03T08:00:00Z', weight_kg: 73.0 })

      expect(res.status).toBe(200)
      expect(res.body.timestamp).toBe('2024-01-03T08:00:00Z')
      expect(res.body.weight_kg).toBe(73.0)
    })

    it('returns existing entry when no updates provided', async () => {
      const res = await request(app).put(`/api/entries/${entryId}`).send({})

      expect(res.status).toBe(200)
      expect(res.body.weight_kg).toBe(70.5)
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

    it('deletes an entry', async () => {
      const res = await request(app).delete(`/api/entries/${entryId}`)
      expect(res.status).toBe(204)

      const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId)
      expect(entry).toBeUndefined()
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
