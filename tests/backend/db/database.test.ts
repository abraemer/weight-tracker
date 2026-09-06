import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setupTestApp, teardownTestDb } from '../test-helper.js'

describe('Database', () => {
  let db: import('better-sqlite3').Database

  beforeEach(async () => {
    db = (await setupTestApp()).db
  })

  afterEach(() => {
    teardownTestDb()
  })

  it('enables the foreign_keys pragma', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('rejects an entry insert for a nonexistent user', () => {
    const insert = db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg) VALUES (999, ?, ?)')
    expect(() => insert.run('2026-01-01T00:00:00Z', 70)).toThrow()
  })
})

describe('getDb lazy initialization', () => {
  let tempDir: string
  let dbPath: string
  let closeFreshDb: () => void = () => {}

  beforeEach(() => {
    vi.resetModules()
    tempDir = mkdtempSync(join(tmpdir(), 'wt-'))
    dbPath = join(tempDir, 'sub', 'db.sqlite')
    process.env.DATABASE_PATH = dbPath
  })

  afterEach(() => {
    closeFreshDb()
    delete process.env.DATABASE_PATH
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates nested parent directories and opens the database lazily', async () => {
    const { getDb, closeDb } = await import('../../../src/backend/db/database.js')
    closeFreshDb = closeDb
    getDb()
    expect(existsSync(dbPath)).toBe(true)
  })
})
