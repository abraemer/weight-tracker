import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import { setTestDb, closeDb } from '../../src/backend/db/database.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const schemaSql = readFileSync(join(__dirname, '../../src/backend/db/schema.sql'), 'utf-8')

export async function setupTestApp(): Promise<{ app: express.Application; db: Database.Database }> {
  const db = new Database(':memory:')
  db.exec(schemaSql)
  setTestDb(db)

  const usersRouter = (await import('../../src/backend/routes/users.js')).default
  const entriesRouter = (await import('../../src/backend/routes/entries.js')).default

  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use('/api/users', usersRouter)
  app.use('/api', entriesRouter)

  return { app, db }
}

export function teardownTestDb(): void {
  closeDb()
}
