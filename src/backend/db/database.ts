import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Database as DatabaseType } from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dbPath = process.env.DATABASE_PATH || 'data/weight-tracker.db'
const db: DatabaseType = new Database(dbPath)

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8')
db.exec(schema)

export default db
