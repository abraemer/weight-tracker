import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { User, Entry } from './types/index.js'

export const CACHE_SCHEMA_VERSION = 1

interface MetaRow {
  key: string
  value: number
}

interface CacheDB extends DBSchema {
  users: {
    key: number
    value: User
  }
  entries: {
    key: number
    value: Entry
  }
  meta: {
    key: string
    value: MetaRow
  }
}

export interface CacheState {
  users: User[]
  entries: Entry[]
}

let dbPromise: Promise<IDBPDatabase<CacheDB>> | null = null

function getDB(): Promise<IDBPDatabase<CacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CacheDB>('weight-tracker', 1, {
      upgrade(db) {
        db.createObjectStore('users', { keyPath: 'id' })
        db.createObjectStore('entries', { keyPath: 'id' })
        db.createObjectStore('meta', { keyPath: 'key' })
      },
    }).catch((e: unknown) => {
      dbPromise = null
      throw e
    })
  }
  return dbPromise
}

async function wipeAllStores(db: IDBPDatabase<CacheDB>): Promise<void> {
  const tx = db.transaction(['users', 'entries', 'meta'], 'readwrite')
  tx.objectStore('users').clear()
  tx.objectStore('entries').clear()
  tx.objectStore('meta').clear()
  await tx.done
}

export async function readCache(): Promise<CacheState | null> {
  const db = await getDB()
  const meta = await db.get('meta', 'schemaVersion')
  if (meta?.value !== CACHE_SCHEMA_VERSION) {
    await wipeAllStores(db)
    return null
  }
  const tx = db.transaction(['users', 'entries'], 'readonly')
  const [users, entries] = await Promise.all([
    tx.objectStore('users').getAll(),
    tx.objectStore('entries').getAll(),
  ])
  return { users, entries }
}

export async function writeCache(state: CacheState): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['users', 'entries', 'meta'], 'readwrite')
  const userStore = tx.objectStore('users')
  const entryStore = tx.objectStore('entries')
  userStore.clear()
  entryStore.clear()
  for (const user of state.users) userStore.put(user)
  for (const entry of state.entries) entryStore.put(entry)
  tx.objectStore('meta').put({ key: 'schemaVersion', value: CACHE_SCHEMA_VERSION })
  await tx.done
}

export async function upsertUsers(rows: User[]): Promise<void> {
  if (rows.length === 0) return
  const db = await getDB()
  const tx = db.transaction('users', 'readwrite')
  await Promise.all(rows.map((row) => tx.store.put(row)))
  await tx.done
}

export async function upsertEntries(rows: Entry[]): Promise<void> {
  if (rows.length === 0) return
  const db = await getDB()
  const tx = db.transaction('entries', 'readwrite')
  await Promise.all(rows.map((row) => tx.store.put(row)))
  await tx.done
}

export async function removeUser(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('users', id)
}

export async function removeEntry(id: number): Promise<void> {
  const db = await getDB()
  await db.delete('entries', id)
}

export async function clearCache(): Promise<void> {
  const db = await getDB()
  await wipeAllStores(db)
}
