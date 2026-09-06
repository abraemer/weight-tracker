import express from 'express'
import Database from 'better-sqlite3'
import { setTestDb, closeDb } from '../../src/backend/db/database.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createApp } from '../../src/backend/app.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const schemaSql = readFileSync(join(__dirname, '../../src/backend/db/schema.sql'), 'utf-8')

export async function setupTestApp(): Promise<{ app: express.Application; db: Database.Database }> {
  const db = new Database(':memory:')
  db.exec(schemaSql)
  setTestDb(db)

  const app = createApp()

  return { app, db }
}

export function teardownTestDb(): void {
  closeDb()
}
