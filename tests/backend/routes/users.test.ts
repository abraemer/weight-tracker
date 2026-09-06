import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { setupTestApp, teardownTestDb } from '../test-helper.js'

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
  })

  describe('POST /api/users', () => {
    it('creates a new user', async () => {
      const res = await request(app).post('/api/users').send({ name: 'Alice' })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('Alice')
      expect(res.body.id).toBeDefined()
      expect(res.body.created_at).toBeDefined()
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
    it('deletes user and cascades to their entries', async () => {
      const result = db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')
      const userId = result.lastInsertRowid
      db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
        userId,
        '2026-01-01 08:00:00',
        80.5
      )

      const res = await request(app).delete(`/api/users/${userId}`)
      expect(res.status).toBe(204)

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
      expect(user).toBeUndefined()

      const entries = db.prepare('SELECT * FROM entries WHERE user_id = ?').all(userId)
      expect(entries).toEqual([])
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
