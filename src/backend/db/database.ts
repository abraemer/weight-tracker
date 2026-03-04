import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const schemaSql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')

let _db: DatabaseType | null = null

export function getDb(): DatabaseType {
  if (!_db) {
    const dbPath = process.env.DATABASE_PATH || 'data/weight-tracker.db'
    _db = new Database(dbPath)
    _db.exec(schemaSql)
  }
  return _db
}

export function setTestDb(db: DatabaseType): void {
  _db = db
  db.exec(schemaSql)
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

const _defaultExport: DatabaseType = getDb()
export default _defaultExport
