import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { setupTestApp, teardownTestDb } from '../test-helper.js'

const EPOCH = '1970-01-01T00:00:00.000Z'

describe('GET /api/state', () => {
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

  it('returns empty mirror when database is empty', async () => {
    const res = await request(app).get('/api/state')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ users: [], entries: [] })
  })

  it('includes tombstoned users and their tombstoned entries', async () => {
    const alice = db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')
    db.prepare('INSERT INTO users (name) VALUES (?)').run('Bob')
    db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
      alice.lastInsertRowid,
      '2026-01-01T00:00:00.000Z',
      80
    )
    const stamp = '2026-01-02T00:00:00.000Z'
    db.prepare('UPDATE users SET deleted = 1, updated_at = ? WHERE id = ?').run(
      stamp,
      alice.lastInsertRowid
    )
    db.prepare('UPDATE entries SET deleted = 1, updated_at = ? WHERE user_id = ?').run(
      stamp,
      alice.lastInsertRowid
    )

    const res = await request(app).get('/api/state')
    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(2)
    expect(res.body.entries).toHaveLength(1)
    const tombstonedUser = res.body.users.find((u: { name: string }) => u.name === 'Alice')
    expect(tombstonedUser.deleted).toBe(true)
    expect(res.body.entries[0].deleted).toBe(true)
    expect(res.body.entries[0].updated_at).toBe(stamp)
  })

  it('maps deleted to boolean and updated_at NULL to epoch', async () => {
    db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')
    const userResult = db.prepare('INSERT INTO users (name) VALUES (?)').run('Bob')
    db.prepare('UPDATE users SET updated_at = NULL WHERE id = ?').run(userResult.lastInsertRowid)
    const entryResult = db
      .prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)')
      .run(userResult.lastInsertRowid, '2026-01-01T00:00:00.000Z', 80)
    db.prepare('UPDATE entries SET updated_at = NULL WHERE id = ?').run(entryResult.lastInsertRowid)

    const res = await request(app).get('/api/state')
    expect(res.status).toBe(200)
    for (const user of res.body.users) {
      expect(typeof user.deleted).toBe('boolean')
      expect(typeof user.updated_at).toBe('string')
      expect(user.updated_at).not.toBeNull()
    }
    for (const entry of res.body.entries) {
      expect(typeof entry.deleted).toBe('boolean')
      expect(typeof entry.updated_at).toBe('string')
      expect(entry.updated_at).not.toBeNull()
    }
    const bob = res.body.users.find((u: { name: string }) => u.name === 'Bob')
    expect(bob.updated_at).toBe(EPOCH)
    expect(res.body.entries[0].updated_at).toBe(EPOCH)
  })

  it('orders entries by id ascending', async () => {
    const user = db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')
    db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
      user.lastInsertRowid,
      '2026-03-01T00:00:00.000Z',
      80
    )
    db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
      user.lastInsertRowid,
      '2026-01-01T00:00:00.000Z',
      81
    )
    db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
      user.lastInsertRowid,
      '2026-02-01T00:00:00.000Z',
      82
    )

    const res = await request(app).get('/api/state')
    expect(res.status).toBe(200)
    const ids = res.body.entries.map((e: { id: number }) => e.id)
    expect(ids).toEqual([...ids].sort((a: number, b: number) => a - b))
  })

  it('orders users by created_at ascending with id tiebreaker', async () => {
    const tie = '2026-01-01 00:00:00'
    db.prepare('INSERT INTO users (name, created_at) VALUES (?, ?)').run('Zed', tie)
    db.prepare('INSERT INTO users (name, created_at) VALUES (?, ?)').run('Earlier', '2025-06-01 00:00:00')
    db.prepare('INSERT INTO users (name, created_at) VALUES (?, ?)').run('Alpha', tie)

    const res = await request(app).get('/api/state')
    expect(res.status).toBe(200)
    const names = res.body.users.map((u: { name: string }) => u.name)
    expect(names).toEqual(['Earlier', 'Zed', 'Alpha'])
  })

  it('sets Cache-Control no-store header', async () => {
    const res = await request(app).get('/api/state')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('ignores query params and returns the full mirror', async () => {
    const user = db.prepare('INSERT INTO users (name) VALUES (?)').run('Alice')
    db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (?, ?, ?)').run(
      user.lastInsertRowid,
      '2026-01-01T00:00:00.000Z',
      80
    )

    const res = await request(app).get('/api/state?since=xyz&limit=1&page=2')
    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(1)
    expect(res.body.entries).toHaveLength(1)
  })
})
