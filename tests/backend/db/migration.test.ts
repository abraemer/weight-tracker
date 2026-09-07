import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { setTestDb, closeDb } from '../../../src/backend/db/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const schemaSql = readFileSync(join(__dirname, '../../../src/backend/db/schema.sql'), 'utf-8')

const legacySchemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  timestamp DATETIME NOT NULL,
  weight_kg REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp);
`

const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

interface UserRow {
  id: number
  name: string
  created_at: string
}

interface EntryRow {
  id: number
  user_id: number
  timestamp: string
  weight_kg: number
  created_at: string
}

interface StampRow {
  updated_at: string | null
  deleted: number
}

function seedLegacyData(db: Database.Database): void {
  const insertUser = db.prepare('INSERT INTO users (name, created_at) VALUES (?, ?)')
  const names = ['Alice', 'Bob', 'Carol']
  for (const [index, name] of names.entries()) {
    insertUser.run(name, `2026-01-0${index + 1} 08:00:00`)
  }
  const insertEntry = db.prepare('INSERT INTO entries (user_id, timestamp, weight_kg, created_at) VALUES (?, ?, ?, ?)')
  for (let i = 0; i < 10; i++) {
    const day = String(i + 1).padStart(2, '0')
    insertEntry.run((i % 3) + 1, `2026-02-${day}T07:30:00Z`, 70.5 + i, `2026-02-${day} 07:30:00`)
  }
}

function createLegacyDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(legacySchemaSql)
  seedLegacyData(db)
  return db
}

function tableColumns(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info(${table})`) as { name: string }[]).map((column) => column.name)
}

function dumpUsers(db: Database.Database): UserRow[] {
  return db.prepare<[], UserRow>('SELECT id, name, created_at FROM users ORDER BY id').all()
}

function dumpEntries(db: Database.Database): EntryRow[] {
  return db
    .prepare<[], EntryRow>('SELECT id, user_id, timestamp, weight_kg, created_at FROM entries ORDER BY id')
    .all()
}

describe('Schema migration via setTestDb', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createLegacyDb()
  })

  afterEach(() => {
    closeDb()
  })

  it('adds updated_at and deleted to a legacy database and backfills one uniform timestamp', () => {
    setTestDb(db)

    expect(tableColumns(db, 'users')).toEqual(expect.arrayContaining(['updated_at', 'deleted']))
    expect(tableColumns(db, 'entries')).toEqual(expect.arrayContaining(['updated_at', 'deleted']))

    const userStamps = db.prepare<[], StampRow>('SELECT updated_at, deleted FROM users').all()
    const entryStamps = db.prepare<[], StampRow>('SELECT updated_at, deleted FROM entries').all()
    const allStamps = [...userStamps, ...entryStamps]

    expect(allStamps).toHaveLength(13)
    for (const row of allStamps) {
      expect(row.updated_at).toMatch(isoPattern)
      expect(row.deleted).toBe(0)
    }
    expect(new Set(allStamps.map((row) => row.updated_at)).size).toBe(1)
  })

  it('changes nothing when the migration runs a second time', () => {
    setTestDb(db)
    const before = {
      users: db.prepare<[], Record<string, unknown>>('SELECT * FROM users ORDER BY id').all(),
      entries: db.prepare<[], Record<string, unknown>>('SELECT * FROM entries ORDER BY id').all(),
    }

    setTestDb(db)

    const after = {
      users: db.prepare<[], Record<string, unknown>>('SELECT * FROM users ORDER BY id').all(),
      entries: db.prepare<[], Record<string, unknown>>('SELECT * FROM entries ORDER BY id').all(),
    }
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))
  })

  it('leaves a database created from the new schema untouched', () => {
    const db = new Database(':memory:')
    db.exec(schemaSql)
    const before = {
      users: tableColumns(db, 'users'),
      entries: tableColumns(db, 'entries'),
    }
    expect(before.users).toEqual(expect.arrayContaining(['updated_at', 'deleted']))
    expect(before.entries).toEqual(expect.arrayContaining(['updated_at', 'deleted']))

    setTestDb(db)

    expect(tableColumns(db, 'users')).toEqual(before.users)
    expect(tableColumns(db, 'entries')).toEqual(before.entries)
  })

  it('preserves pre-existing data byte-identically', () => {
    const before = { users: dumpUsers(db), entries: dumpEntries(db) }

    setTestDb(db)

    expect(JSON.stringify(dumpUsers(db))).toBe(JSON.stringify(before.users))
    expect(JSON.stringify(dumpEntries(db))).toBe(JSON.stringify(before.entries))
  })

  it('backfills only rows with NULL updated_at on a mixed database', () => {
    setTestDb(db)
    const firstRun = db.prepare<[], { updated_at: string | null }>('SELECT updated_at FROM users WHERE id = 1').get()
    db.prepare('INSERT INTO users (name, created_at, updated_at) VALUES (?, ?, NULL)').run(
      'Dave',
      '2026-03-01 09:00:00',
    )

    setTestDb(db)

    const rows = db.prepare<[], { id: number; updated_at: string | null }>('SELECT id, updated_at FROM users ORDER BY id').all()
    expect(rows).toHaveLength(4)
    expect(rows[3].updated_at).toMatch(isoPattern)
    expect(rows[3].updated_at! >= firstRun!.updated_at!).toBe(true)
    for (const row of rows.slice(0, 3)) {
      expect(row.updated_at).toBe(firstRun!.updated_at)
    }
  })
})

describe('Schema migration via getDb on a legacy database file', () => {
  let tempDir: string
  let dbPath: string
  let closeFreshDb: () => void = () => {}

  beforeEach(() => {
    vi.resetModules()
    tempDir = mkdtempSync(join(tmpdir(), 'wt-migration-'))
    dbPath = join(tempDir, 'legacy.sqlite')
    const legacy = new Database(dbPath)
    legacy.exec(legacySchemaSql)
    seedLegacyData(legacy)
    legacy.close()
    process.env.DATABASE_PATH = dbPath
  })

  afterEach(() => {
    closeFreshDb()
    delete process.env.DATABASE_PATH
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('migrates the legacy file and backfills a uniform timestamp on first getDb call', async () => {
    const { getDb, closeDb } = await import('../../../src/backend/db/database.js')
    closeFreshDb = closeDb
    const db = getDb()

    expect(tableColumns(db, 'users')).toEqual(expect.arrayContaining(['updated_at', 'deleted']))
    expect(tableColumns(db, 'entries')).toEqual(expect.arrayContaining(['updated_at', 'deleted']))

    const userStamps = db.prepare<[], StampRow>('SELECT updated_at, deleted FROM users').all()
    const entryStamps = db.prepare<[], StampRow>('SELECT updated_at, deleted FROM entries').all()
    const allStamps = [...userStamps, ...entryStamps]
    expect(allStamps).toHaveLength(13)
    for (const row of allStamps) {
      expect(row.updated_at).toMatch(isoPattern)
      expect(row.deleted).toBe(0)
    }
    expect(new Set(allStamps.map((row) => row.updated_at)).size).toBe(1)
  })
})
