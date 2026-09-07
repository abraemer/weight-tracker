import Database from 'better-sqlite3'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const schemaSql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')

let _db: DatabaseType | null = null

export function migrateSchema(db: DatabaseType): void {
  const migrationTimestamp = new Date().toISOString()
  for (const table of ['users', 'entries'] as const) {
    const columns = new Set(
      (db.pragma(`table_info(${table})`) as { name: string }[]).map((column) => column.name),
    )
    if (!columns.has('updated_at')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN updated_at TEXT`)
    }
    if (!columns.has('deleted')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0`)
    }
  }
  db.transaction(() => {
    db.prepare('UPDATE users SET updated_at = ? WHERE updated_at IS NULL').run(migrationTimestamp)
    db.prepare('UPDATE entries SET updated_at = ? WHERE updated_at IS NULL').run(migrationTimestamp)
  })()
}

export function getDb(): DatabaseType {
  if (!_db) {
    const dbPath = process.env.DATABASE_PATH || 'data/weight-tracker.db'
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true })
    }
    _db = new Database(dbPath)
    _db.pragma('foreign_keys = ON')
    _db.pragma('journal_mode = WAL')
    _db.exec(schemaSql)
    migrateSchema(_db)
  }
  return _db
}

export function setTestDb(db: DatabaseType): void {
  _db = db
  db.exec(schemaSql)
  migrateSchema(db)
  db.pragma('foreign_keys = ON')
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
