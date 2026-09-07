import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import 'fake-indexeddb/auto'

vi.mock('../../src/frontend/api.js', () => ({
  fetchEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  fetchState: vi.fn(),
}))

import { fetchEntries, createEntry, updateEntry, deleteEntry, fetchState } from '../../src/frontend/api.js'
import {
  useEntries,
  resetEntriesState,
  entriesFor,
  entriesByUser,
  operationLoading,
} from '../../src/frontend/composables/useEntries.js'
import { resetSyncState } from '../../src/frontend/composables/useSync.js'
import { writeCache, clearCache } from '../../src/frontend/cache.js'
import type { User, Entry } from '../../src/frontend/types/index.js'

const mockedFetchEntries = vi.mocked(fetchEntries)
const mockedCreateEntry = vi.mocked(createEntry)
const mockedUpdateEntry = vi.mocked(updateEntry)
const mockedDeleteEntry = vi.mocked(deleteEntry)
const mockedFetchState = vi.mocked(fetchState)

const alice: User = {
  id: 1,
  name: 'Alice',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  deleted: false,
}

const entryA: Entry = {
  id: 101,
  user_id: 10,
  timestamp: '2024-01-15T10:00:00.000Z',
  weight_kg: 70.5,
  created_at: '2024-01-15T10:00:00.000Z',
  updated_at: '2024-01-15T10:00:00.000Z',
  deleted: false,
}
const entryB: Entry = {
  id: 102,
  user_id: 10,
  timestamp: '2024-01-16T10:00:00.000Z',
  weight_kg: 71.0,
  created_at: '2024-01-16T10:00:00.000Z',
  updated_at: '2024-01-16T10:00:00.000Z',
  deleted: false,
}
const entryTombstone: Entry = {
  id: 103,
  user_id: 10,
  timestamp: '2024-01-17T10:00:00.000Z',
  weight_kg: 72.0,
  created_at: '2024-01-17T10:00:00.000Z',
  updated_at: '2024-01-18T10:00:00.000Z',
  deleted: true,
}
const entryOtherUser: Entry = {
  id: 104,
  user_id: 20,
  timestamp: '2024-02-01T10:00:00.000Z',
  weight_kg: 65.0,
  created_at: '2024-02-01T10:00:00.000Z',
  updated_at: '2024-02-01T10:00:00.000Z',
  deleted: false,
}

function openRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('weight-tracker')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readStoreAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request: IDBRequest<T[]> = db.transaction(storeName).objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readCachedEntries(): Promise<Entry[]> {
  const db = await openRaw()
  const stored = await readStoreAll<Entry>(db, 'entries')
  db.close()
  return stored
}

describe('useEntries composable', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetEntriesState()
    resetSyncState()
    await clearCache()
  })

  describe('derived entriesFor state', () => {
    it('updates the derived computed when the entriesByUser Map instance is replaced wholesale', () => {
      const entries = entriesFor(10)
      expect(entries.value).toEqual([])

      entriesByUser.value = new Map([
        [10, [entryB, entryA]],
        [20, [entryOtherUser]],
      ])

      expect(entries.value).toEqual([entryB, entryA])
      expect(mockedFetchEntries).not.toHaveBeenCalled()
    })

    it('exposes operationLoading as a module-level ref of Map', () => {
      expect(operationLoading.value).toBeInstanceOf(Map)
    })

    it('shows temp negative-id rows in the derived list during in-flight adds', async () => {
      let resolveCreate: (value: Entry) => void = () => {}
      const pending = new Promise<Entry>((resolve) => {
        resolveCreate = resolve
      })
      mockedCreateEntry.mockReturnValue(pending)

      const { addEntry } = useEntries(10)
      const entries = entriesFor(10)
      const promise = addEntry({ timestamp: '2024-01-16T10:00:00Z', weight_kg: 71.0 })

      await vi.waitFor(() => {
        expect(entries.value).toHaveLength(1)
      })
      expect(entries.value[0]!.id).toBeLessThan(0)
      expect(entries.value[0]!.user_id).toBe(10)

      resolveCreate({ ...entryA, id: 105 })
      await promise

      expect(entries.value).toHaveLength(1)
      expect(entries.value[0]!.id).toBe(105)
    })
  })

  describe('loadEntries', () => {
    it('loads entries for a user', async () => {
      const mockEntries = [
        {
          id: 1,
          user_id: 10,
          timestamp: '2024-01-15T10:00:00Z',
          weight_kg: 70.5,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]
      mockedFetchEntries.mockResolvedValue(mockEntries)

      const { loading, loadEntries } = useEntries(10)
      const entries = entriesFor(10)
      await loadEntries()

      expect(loading.value).toBe(false)
      expect(entries.value).toEqual(mockEntries)
    })

    it('handles null userId', async () => {
      const { loadEntries } = useEntries(null)
      const entries = entriesFor(10)
      await loadEntries()

      expect(entries.value).toEqual([])
      expect(mockedFetchEntries).not.toHaveBeenCalled()
    })

    it('sets error on failure', async () => {
      mockedFetchEntries.mockRejectedValue(new Error('Failed to load'))

      const { error, loadEntries } = useEntries(11)
      await loadEntries()

      expect(error.value).toBe('Failed to load')
    })
  })

  describe('loadEntries cache-first', () => {
    it('renders entries from a warm cache instantly and schedules a background sync instead of a direct fetch, tombstones filtered, sorted timestamp DESC', async () => {
      await writeCache({ users: [alice], entries: [entryTombstone, entryA, entryOtherUser, entryB] })
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))

      const { loading, loadEntries } = useEntries(10)
      const entries = entriesFor(10)
      void loadEntries()

      await vi.waitFor(() => {
        expect(entries.value).toEqual([entryB, entryA])
      })
      expect(loading.value).toBe(false)
      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
      expect(mockedFetchEntries).not.toHaveBeenCalled()
    })

    it('renders an empty entries state instantly for a warm-cache user with zero entries', async () => {
      await writeCache({ users: [alice], entries: [entryOtherUser] })
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))

      const { loading, loadEntries } = useEntries(30)
      const entries = entriesFor(30)
      void loadEntries()

      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
      expect(entries.value).toEqual([])
      expect(loading.value).toBe(false)
      expect(mockedFetchEntries).not.toHaveBeenCalled()
    })

    it('keeps the cold-cache network path with spinner flags', async () => {
      let resolveFetch: (value: Entry[]) => void = () => {}
      const pending = new Promise<Entry[]>((resolve) => {
        resolveFetch = resolve
      })
      mockedFetchEntries.mockReturnValue(pending)

      const { loading, loadEntries } = useEntries(10)
      const entries = entriesFor(10)
      const promise = loadEntries()

      await vi.waitFor(() => {
        expect(loading.value).toBe(true)
      })
      expect(entries.value).toEqual([])

      resolveFetch([entryB])
      await promise

      expect(entries.value).toEqual([entryB])
      expect(loading.value).toBe(false)
    })

    it('writes successful network results to the cache', async () => {
      mockedFetchEntries.mockResolvedValue([entryA])

      const { loadEntries } = useEntries(10)
      const entries = entriesFor(10)
      await loadEntries()

      expect(entries.value).toEqual([entryA])
      const stored = await readCachedEntries()
      expect(stored).toEqual([entryA])
    })
  })

  describe('addEntry', () => {
    it('optimistically adds entry and updates on success', async () => {
      const mockEntries = [
        {
          id: 1,
          user_id: 20,
          timestamp: '2024-01-15T10:00:00Z',
          weight_kg: 70.5,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]
      const newEntryData = { timestamp: '2024-01-16T10:00:00Z', weight_kg: 71.0 }
      const createdEntry = {
        id: 2,
        user_id: 20,
        ...newEntryData,
        created_at: '2024-01-16T10:00:00Z',
      }

      mockedFetchEntries.mockResolvedValue(mockEntries)
      mockedCreateEntry.mockResolvedValue(createdEntry)

      const { addEntry, loadEntries } = useEntries(20)
      const entries = entriesFor(20)
      await loadEntries()

      const result = await addEntry(newEntryData)

      expect(result).toEqual(createdEntry)
      expect(entries.value[0]).toEqual(createdEntry)
      expect(entries.value).toHaveLength(2)
    })

    it('rolls back on failure', async () => {
      const mockEntries = [
        {
          id: 1,
          user_id: 21,
          timestamp: '2024-01-15T10:00:00Z',
          weight_kg: 70.5,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]
      mockedFetchEntries.mockResolvedValue(mockEntries)
      mockedCreateEntry.mockRejectedValue(new Error('Create failed'))

      const { addEntry, loadEntries, error } = useEntries(21)
      const entries = entriesFor(21)
      await loadEntries()
      const originalLength = entries.value.length

      const result = await addEntry({ timestamp: '2024-01-16T10:00:00Z', weight_kg: 71.0 })

      expect(result).toBe(null)
      expect(entries.value).toHaveLength(originalLength)
      expect(error.value).toBe('Create failed')
    })

    it('returns null for null userId', async () => {
      const { addEntry } = useEntries(null)
      const result = await addEntry({ timestamp: '2024-01-16T10:00:00Z', weight_kg: 71.0 })

      expect(result).toBe(null)
    })
  })

  describe('editEntry', () => {
    it('optimistically updates entry and confirms on success', async () => {
      const mockEntries = [
        {
          id: 100,
          user_id: 30,
          timestamp: '2024-01-15T10:00:00Z',
          weight_kg: 70.5,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]
      const updatedEntry = { ...mockEntries[0]!, weight_kg: 71.0 }
      mockedFetchEntries.mockResolvedValue(mockEntries)
      mockedUpdateEntry.mockResolvedValue({ kind: 'ok', entry: updatedEntry })

      const { editEntry, loadEntries } = useEntries(30)
      const entries = entriesFor(30)
      await loadEntries()

      const result = await editEntry(100, { weight_kg: 71.0 })

      expect(result).toEqual(updatedEntry)
      expect(entries.value.find((e) => e.id === 100)?.weight_kg).toBe(71.0)
    })

    it('rolls back on failure', async () => {
      const mockEntries = [
        {
          id: 101,
          user_id: 31,
          timestamp: '2024-01-15T10:00:00Z',
          weight_kg: 70.5,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]
      mockedFetchEntries.mockResolvedValue(mockEntries)
      mockedUpdateEntry.mockRejectedValue(new Error('Update failed'))

      const { editEntry, loadEntries, error } = useEntries(31)
      const entries = entriesFor(31)
      await loadEntries()
      const originalEntry = { ...entries.value.find((e) => e.id === 101)! }

      const result = await editEntry(101, { weight_kg: 999 })

      expect(result).toBe(null)
      expect(entries.value.find((e) => e.id === 101)).toEqual(originalEntry)
      expect(error.value).toBe('Update failed')
    })

    it('sends the observed version to the api', async () => {
      entriesByUser.value = new Map([[10, [entryA]]])
      mockedUpdateEntry.mockResolvedValue({ kind: 'ok', entry: entryA })

      const { editEntry } = useEntries(10)
      await editEntry(101, { weight_kg: 71.0 })

      expect(mockedUpdateEntry).toHaveBeenCalledWith(101, { weight_kg: 71.0 }, entryA.updated_at)
    })

    it('adopts the newest live server row on conflict without surfacing an error', async () => {
      await writeCache({ users: [alice], entries: [entryA, entryB] })
      entriesByUser.value = new Map([[10, [entryB, entryA]]])
      const serverRow: Entry = { ...entryA, weight_kg: 99.5, updated_at: '2024-02-01T10:00:00.000Z' }
      mockedUpdateEntry.mockResolvedValue({ kind: 'conflict', entry: serverRow })

      const { editEntry, error } = useEntries(10)
      const entries = entriesFor(10)
      const result = await editEntry(101, { weight_kg: 50 })

      expect(result).toBe(null)
      expect(entries.value.find((e) => e.id === 101)).toEqual(serverRow)
      expect(error.value).toBe(null)
      const stored = await readCachedEntries()
      expect(stored.find((e) => e.id === 101)).toEqual(serverRow)
    })

    it('removes the row from state and cache when the server newest is a tombstone', async () => {
      await writeCache({ users: [alice], entries: [entryA, entryB] })
      entriesByUser.value = new Map([[10, [entryB, entryA]]])
      const serverTombstone: Entry = { ...entryA, deleted: true, updated_at: '2024-02-01T10:00:00.000Z' }
      mockedUpdateEntry.mockResolvedValue({ kind: 'conflict', entry: serverTombstone })

      const { editEntry, error } = useEntries(10)
      const entries = entriesFor(10)
      const result = await editEntry(101, { weight_kg: 50 })

      expect(result).toBe(null)
      expect(entries.value.find((e) => e.id === 101)).toBeUndefined()
      expect(error.value).toBe(null)
      const stored = await readCachedEntries()
      expect(stored.find((e) => e.id === 101)).toBeUndefined()
    })

    it('removes the row from state and cache on gone (404)', async () => {
      await writeCache({ users: [alice], entries: [entryA, entryB] })
      entriesByUser.value = new Map([[10, [entryB, entryA]]])
      mockedUpdateEntry.mockResolvedValue({ kind: 'gone' })

      const { editEntry, error } = useEntries(10)
      const entries = entriesFor(10)
      const result = await editEntry(101, { weight_kg: 50 })

      expect(result).toBe(null)
      expect(entries.value.find((e) => e.id === 101)).toBeUndefined()
      expect(error.value).toBe(null)
      const stored = await readCachedEntries()
      expect(stored.find((e) => e.id === 101)).toBeUndefined()
    })
  })

  describe('removeEntry', () => {
    it('optimistically removes entry and confirms on success', async () => {
      const mockEntries = [
        {
          id: 200,
          user_id: 40,
          timestamp: '2024-01-15T10:00:00Z',
          weight_kg: 70.5,
          created_at: '2024-01-15T10:00:00Z',
        },
        {
          id: 201,
          user_id: 40,
          timestamp: '2024-01-14T10:00:00Z',
          weight_kg: 70.0,
          created_at: '2024-01-14T10:00:00Z',
        },
      ]
      mockedFetchEntries.mockResolvedValue(mockEntries)
      mockedDeleteEntry.mockResolvedValue({ kind: 'ok' })

      const { removeEntry, loadEntries } = useEntries(40)
      const entries = entriesFor(40)
      await loadEntries()

      const result = await removeEntry(200)

      expect(result).toBe(true)
      expect(entries.value.find((e) => e.id === 200)).toBeUndefined()
      expect(entries.value).toHaveLength(1)
    })

    it('rolls back on failure', async () => {
      const mockEntries = [
        {
          id: 202,
          user_id: 41,
          timestamp: '2024-01-15T10:00:00Z',
          weight_kg: 70.5,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]
      mockedFetchEntries.mockResolvedValue(mockEntries)
      mockedDeleteEntry.mockRejectedValue(new Error('Delete failed'))

      const { removeEntry, loadEntries, error } = useEntries(41)
      const entries = entriesFor(41)
      await loadEntries()
      const originalLength = entries.value.length

      const result = await removeEntry(202)

      expect(result).toBe(false)
      expect(entries.value).toHaveLength(originalLength)
      expect(error.value).toBe('Delete failed')
    })

    it('sends the observed version as a query param to the api', async () => {
      entriesByUser.value = new Map([[10, [entryA]]])
      mockedDeleteEntry.mockResolvedValue({ kind: 'ok' })

      const { removeEntry } = useEntries(10)
      await removeEntry(101)

      expect(mockedDeleteEntry).toHaveBeenCalledWith(101, entryA.updated_at)
    })

    it('removes the row from state and cache immediately on plain success', async () => {
      await writeCache({ users: [alice], entries: [entryA, entryB] })
      entriesByUser.value = new Map([[10, [entryB, entryA]]])
      mockedDeleteEntry.mockResolvedValue({ kind: 'ok' })

      const { removeEntry, error } = useEntries(10)
      const entries = entriesFor(10)
      const result = await removeEntry(101)

      expect(result).toBe(true)
      expect(entries.value.find((e) => e.id === 101)).toBeUndefined()
      expect(entries.value).toEqual([entryB])
      expect(error.value).toBe(null)
      const stored = await readCachedEntries()
      expect(stored.find((e) => e.id === 101)).toBeUndefined()
      expect(stored.find((e) => e.id === 102)).toEqual(entryB)
    })

    it('restores the server row on conflict with a live entry', async () => {
      await writeCache({ users: [alice], entries: [entryA, entryB] })
      entriesByUser.value = new Map([[10, [entryB, entryA]]])
      const serverRow: Entry = { ...entryA, weight_kg: 99.5, updated_at: '2024-02-01T10:00:00.000Z' }
      mockedDeleteEntry.mockResolvedValue({ kind: 'conflict', entry: serverRow })

      const { removeEntry, error } = useEntries(10)
      const entries = entriesFor(10)
      const result = await removeEntry(101)

      expect(result).toBe(false)
      expect(entries.value.find((e) => e.id === 101)).toEqual(serverRow)
      expect(error.value).toBe(null)
      const stored = await readCachedEntries()
      expect(stored.find((e) => e.id === 101)).toEqual(serverRow)
    })

    it('keeps the row removed when the conflict is a tombstone', async () => {
      await writeCache({ users: [alice], entries: [entryA, entryB] })
      entriesByUser.value = new Map([[10, [entryB, entryA]]])
      const serverTombstone: Entry = { ...entryA, deleted: true, updated_at: '2024-02-01T10:00:00.000Z' }
      mockedDeleteEntry.mockResolvedValue({ kind: 'conflict', entry: serverTombstone })

      const { removeEntry, error } = useEntries(10)
      const entries = entriesFor(10)
      const result = await removeEntry(101)

      expect(result).toBe(true)
      expect(entries.value.find((e) => e.id === 101)).toBeUndefined()
      expect(entries.value).toEqual([entryB])
      expect(error.value).toBe(null)
      const stored = await readCachedEntries()
      expect(stored.find((e) => e.id === 101)).toBeUndefined()
    })

    it('stays deleted on gone (404) and drops the row from cache', async () => {
      await writeCache({ users: [alice], entries: [entryA, entryB] })
      entriesByUser.value = new Map([[10, [entryB, entryA]]])
      mockedDeleteEntry.mockResolvedValue({ kind: 'gone' })

      const { removeEntry, error } = useEntries(10)
      const entries = entriesFor(10)
      const result = await removeEntry(101)

      expect(result).toBe(true)
      expect(entries.value.find((e) => e.id === 101)).toBeUndefined()
      expect(entries.value).toEqual([entryB])
      expect(error.value).toBe(null)
      const stored = await readCachedEntries()
      expect(stored.find((e) => e.id === 101)).toBeUndefined()
    })
  })

  describe('mutation-triggered background sync', () => {
    it('requests a sync after a successful addEntry', async () => {
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))
      const created: Entry = { ...entryB, id: 105 }
      mockedCreateEntry.mockResolvedValue(created)

      const { addEntry } = useEntries(10)
      const result = await addEntry({ timestamp: '2024-01-16T10:00:00Z', weight_kg: 71.0 })

      expect(result).toEqual(created)
      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
    })

    it('requests a sync after a successful editEntry', async () => {
      entriesByUser.value = new Map([[10, [entryA]]])
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))
      mockedUpdateEntry.mockResolvedValue({ kind: 'ok', entry: { ...entryA, weight_kg: 72.5 } })

      const { editEntry } = useEntries(10)
      const result = await editEntry(101, { weight_kg: 72.5 })

      expect(result).toEqual({ ...entryA, weight_kg: 72.5 })
      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
    })

    it('requests a sync after a successful removeEntry', async () => {
      entriesByUser.value = new Map([[10, [entryA]]])
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))
      mockedDeleteEntry.mockResolvedValue({ kind: 'ok' })

      const { removeEntry } = useEntries(10)
      const result = await removeEntry(101)

      expect(result).toBe(true)
      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
    })

    it('does not request a sync after a failed mutation', async () => {
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))
      mockedCreateEntry.mockRejectedValue(new Error('Create failed'))

      const { addEntry, error } = useEntries(10)
      const result = await addEntry({ timestamp: '2024-01-16T10:00:00Z', weight_kg: 71.0 })

      expect(result).toBe(null)
      expect(error.value).toBe('Create failed')
      expect(mockedFetchState).not.toHaveBeenCalled()
    })
  })

  describe('isOperationLoading', () => {
    it('tracks loading state for operations', async () => {
      const mockEntries = [
        {
          id: 300,
          user_id: 50,
          timestamp: '2024-01-15T10:00:00Z',
          weight_kg: 70.5,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]
      mockedFetchEntries.mockResolvedValue(mockEntries)
      mockedCreateEntry.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))

      const { isOperationLoading, addEntry, loadEntries } = useEntries(50)
      await loadEntries()

      expect(isOperationLoading('add-50')).toBe(false)

      const promise = addEntry({ timestamp: '2024-01-16T10:00:00Z', weight_kg: 71.0 })
      await nextTick()
      expect(isOperationLoading('add-50')).toBe(true)

      await promise
      expect(isOperationLoading('add-50')).toBe(false)
    })
  })
})
