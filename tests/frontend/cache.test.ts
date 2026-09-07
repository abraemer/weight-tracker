import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CACHE_SCHEMA_VERSION,
  readCache,
  writeCache,
  upsertUsers,
  upsertEntries,
  removeUser,
  removeEntry,
  clearCache,
} from '../../src/frontend/cache.js'
import type { User, Entry } from '../../src/frontend/types/index.js'

const users: User[] = [
  {
    id: 1,
    name: 'Alice',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    deleted: false,
  },
  {
    id: 2,
    name: 'Bob',
    created_at: '2024-01-02T00:00:00.000Z',
    updated_at: '2024-01-04T00:00:00.000Z',
    deleted: true,
  },
]

const entries: Entry[] = [
  {
    id: 1,
    user_id: 1,
    timestamp: '2024-01-05T08:00:00.000Z',
    weight_kg: 80.5,
    created_at: '2024-01-05T08:00:01.000Z',
    updated_at: '2024-01-05T08:00:01.000Z',
    deleted: false,
  },
  {
    id: 2,
    user_id: 1,
    timestamp: '2024-02-10T08:00:00.000Z',
    weight_kg: 79.9,
    created_at: '2024-02-10T08:00:01.000Z',
    updated_at: '2024-02-11T08:00:01.000Z',
    deleted: true,
  },
  {
    id: 3,
    user_id: 2,
    timestamp: '2024-03-01T08:00:00.000Z',
    weight_kg: 65.0,
    created_at: '2024-03-01T08:00:01.000Z',
    updated_at: '2024-03-01T08:00:01.000Z',
    deleted: false,
  },
]

function openRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('weight-tracker')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function countStore(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function putMeta(db: IDBDatabase, row: { key: string; value: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite')
    tx.objectStore('meta').put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

describe('cache', () => {
  beforeEach(async () => {
    await clearCache()
  })

  it('exposes schema version 1', () => {
    expect(CACHE_SCHEMA_VERSION).toBe(1)
  })

  it('returns null on a cold cache', async () => {
    const state = await readCache()
    expect(state).toBeNull()
  })

  it('preserves rows verbatim on a write-read roundtrip, tombstones included', async () => {
    await writeCache({ users, entries })
    const state = await readCache()
    expect(state).toEqual({ users, entries })
  })

  it('returns null and wipes all stores when the stored version mismatches', async () => {
    await writeCache({ users, entries })
    const db = await openRaw()
    await putMeta(db, { key: 'schemaVersion', value: 0 })
    expect(await readCache()).toBeNull()
    expect(await countStore(db, 'users')).toBe(0)
    expect(await countStore(db, 'entries')).toBe(0)
    expect(await countStore(db, 'meta')).toBe(0)
    db.close()
  })

  it('upsertUsers replaces rows by id and adds new ones', async () => {
    await writeCache({ users, entries })
    const replacedUser: User = { ...users[0]!, name: 'Alicia', updated_at: '2024-06-01T00:00:00.000Z' }
    const newUser: User = {
      id: 3,
      name: 'Carol',
      created_at: '2024-05-01T00:00:00.000Z',
      updated_at: '2024-05-01T00:00:00.000Z',
      deleted: false,
    }
    await upsertUsers([replacedUser, newUser])
    const state = await readCache()
    expect(state?.users).toEqual([replacedUser, users[1], newUser])
    expect(state?.entries).toEqual(entries)
  })

  it('upsertEntries replaces rows by id and adds new ones', async () => {
    await writeCache({ users, entries })
    const replacedEntry: Entry = { ...entries[1]!, weight_kg: 78.1, deleted: false }
    const newEntry: Entry = {
      id: 4,
      user_id: 2,
      timestamp: '2024-04-01T08:00:00.000Z',
      weight_kg: 64.2,
      created_at: '2024-04-01T08:00:01.000Z',
      updated_at: '2024-04-01T08:00:01.000Z',
      deleted: false,
    }
    await upsertEntries([replacedEntry, newEntry])
    const state = await readCache()
    expect(state?.entries).toEqual([entries[0], replacedEntry, entries[2], newEntry])
    expect(state?.users).toEqual(users)
  })

  it('removeUser removes only the user row', async () => {
    await writeCache({ users, entries })
    await removeUser(1)
    const state = await readCache()
    expect(state?.users).toEqual([users[1]])
    expect(state?.entries).toEqual(entries)
  })

  it('removeEntry removes only the entry row', async () => {
    await writeCache({ users, entries })
    await removeEntry(2)
    const state = await readCache()
    expect(state?.entries).toEqual([entries[0], entries[2]])
    expect(state?.users).toEqual(users)
  })

  it('clearCache empties every store and leaves the cache cold', async () => {
    await writeCache({ users, entries })
    await clearCache()
    expect(await readCache()).toBeNull()
    const db = await openRaw()
    expect(await countStore(db, 'users')).toBe(0)
    expect(await countStore(db, 'entries')).toBe(0)
    expect(await countStore(db, 'meta')).toBe(0)
    db.close()
  })
})
