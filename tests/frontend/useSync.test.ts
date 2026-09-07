import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('../../src/frontend/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/frontend/api.js')>()
  return {
    ...actual,
    fetchState: vi.fn(),
    createEntry: vi.fn(),
  }
})

import { fetchState, createEntry } from '../../src/frontend/api.js'
import { useSync, resetSyncState } from '../../src/frontend/composables/useSync.js'
import { resetUsersState, users, activeUserId } from '../../src/frontend/composables/useUsers.js'
import {
  resetEntriesState,
  entriesByUser,
  operationLoading,
  entriesFor,
  useEntries,
} from '../../src/frontend/composables/useEntries.js'
import { readCache, clearCache } from '../../src/frontend/cache.js'
import type { User, Entry } from '../../src/frontend/types/index.js'

const mockedFetchState = vi.mocked(fetchState)
const mockedCreateEntry = vi.mocked(createEntry)

type SyncState = { users: User[]; entries: Entry[] }

const alice: User = {
  id: 1,
  name: 'Alice',
  created_at: '2024-01-02T00:00:00.000Z',
  updated_at: '2024-01-02T00:00:00.000Z',
  deleted: false,
}
const carol: User = {
  id: 3,
  name: 'Carol',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  deleted: false,
}
const bob: User = {
  id: 2,
  name: 'Bob',
  created_at: '2024-01-03T00:00:00.000Z',
  updated_at: '2024-01-03T00:00:00.000Z',
  deleted: false,
}
const bobTombstone: User = {
  ...bob,
  deleted: true,
  updated_at: '2024-02-01T00:00:00.000Z',
}

const entryA: Entry = {
  id: 101,
  user_id: 1,
  timestamp: '2024-01-15T10:00:00.000Z',
  weight_kg: 70.5,
  created_at: '2024-01-15T10:00:00.000Z',
  updated_at: '2024-01-15T10:00:00.000Z',
  deleted: false,
}
const entryB: Entry = {
  id: 102,
  user_id: 1,
  timestamp: '2024-01-16T10:00:00.000Z',
  weight_kg: 71.0,
  created_at: '2024-01-16T10:00:00.000Z',
  updated_at: '2024-01-16T10:00:00.000Z',
  deleted: false,
}
const entryBob: Entry = {
  id: 201,
  user_id: 2,
  timestamp: '2024-01-14T10:00:00.000Z',
  weight_kg: 80.0,
  created_at: '2024-01-14T10:00:00.000Z',
  updated_at: '2024-01-14T10:00:00.000Z',
  deleted: false,
}
const entryBobTombstone: Entry = {
  ...entryBob,
  deleted: true,
  updated_at: '2024-02-01T00:00:00.000Z',
}
const tempEntry: Entry = {
  id: -1234,
  user_id: 1,
  timestamp: '2024-01-18T10:00:00.000Z',
  weight_kg: 72.5,
  created_at: '2024-01-18T09:00:00.000Z',
  updated_at: '2024-01-18T09:00:00.000Z',
  deleted: false,
}

async function settle(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
  }
}

describe('useSync background sync engine', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
    resetUsersState()
    resetEntriesState()
    resetSyncState()
    window.localStorage.clear()
    await clearCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetSyncState()
  })

  describe('debounce and single-flight', () => {
    it('coalesces request() calls within the debounce window into one fetchState call', async () => {
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA] })
      const { request } = useSync()

      request()
      request()
      await settle(300)

      expect(mockedFetchState).toHaveBeenCalledTimes(1)
    })

    it('defers a request arriving during an in-flight sync to exactly one re-run', async () => {
      let resolveFirst!: (value: SyncState) => void
      mockedFetchState.mockImplementationOnce(
        () => new Promise<SyncState>((resolve) => {
          resolveFirst = resolve
        })
      )
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA] })
      const { request } = useSync()

      request()
      await settle(300)
      expect(mockedFetchState).toHaveBeenCalledTimes(1)

      request()
      await settle(300)
      expect(mockedFetchState).toHaveBeenCalledTimes(1)

      resolveFirst({ users: [alice], entries: [entryA] })
      await settle(300)
      expect(mockedFetchState).toHaveBeenCalledTimes(2)
    })

    it('marks dirty once for a burst of requests during an in-flight sync', async () => {
      let resolveFirst!: (value: SyncState) => void
      mockedFetchState.mockImplementationOnce(
        () => new Promise<SyncState>((resolve) => {
          resolveFirst = resolve
        })
      )
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA] })
      const { request } = useSync()

      request()
      await settle(300)
      for (let i = 0; i < 5; i += 1) {
        request()
      }
      await settle(300)
      expect(mockedFetchState).toHaveBeenCalledTimes(1)

      resolveFirst({ users: [alice], entries: [entryA] })
      await settle(300)
      expect(mockedFetchState).toHaveBeenCalledTimes(2)
    })
  })

  describe('optimistic state preservation during in-flight operations', () => {
    it('keeps the local optimistic row in reactive state during an in-flight edit while the cache mirrors the server wholesale', async () => {
      const optimistic: Entry = { ...entryA, weight_kg: 999, updated_at: '2024-01-20T00:00:00.000Z' }
      users.value = [alice]
      entriesByUser.value = new Map([[1, [entryB, optimistic]]])
      operationLoading.value.set('edit-101', true)
      const derived = entriesFor(1)
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA, entryB] })

      const { request } = useSync()
      request()
      await settle(300)

      expect(derived.value.find((e) => e.id === 101)).toEqual(optimistic)
      const cached = await readCache()
      expect(cached?.entries.find((e) => e.id === 101)).toEqual(entryA)
      expect(cached?.entries).toEqual([entryA, entryB])
    })

    it('keeps a row under in-flight deletion absent from the merged state while the cache mirrors the server row', async () => {
      users.value = [alice]
      entriesByUser.value = new Map([[1, [entryB, entryA]]])
      operationLoading.value.set('delete-101', true)
      const derived = entriesFor(1)
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA, entryB] })

      const { request } = useSync()
      request()
      await settle(300)

      expect(derived.value.find((e) => e.id === 101)).toBeUndefined()
      expect(derived.value).toEqual([entryB])
      const cached = await readCache()
      expect(cached?.entries.find((e) => e.id === 101)).toEqual(entryA)
    })

    it('carries temp negative-id rows over the merged state during an in-flight add', async () => {
      users.value = [alice]
      entriesByUser.value = new Map([[1, [tempEntry, entryA]]])
      operationLoading.value.set('add-1', true)
      const derived = entriesFor(1)
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA, entryB] })

      const { request } = useSync()
      request()
      await settle(300)

      expect(derived.value).toEqual([tempEntry, entryB, entryA])
    })
  })

  describe('tombstones and derived state', () => {
    it('drops a tombstoned user and their entries from users and the entries map', async () => {
      users.value = [alice, bob]
      entriesByUser.value = new Map([
        [1, [entryB, entryA]],
        [2, [entryBob]],
      ])
      const derivedAlice = entriesFor(1)
      const derivedBob = entriesFor(2)
      mockedFetchState.mockResolvedValue({
        users: [alice, bobTombstone, carol],
        entries: [entryA, entryB, entryBobTombstone],
      })

      const { request } = useSync()
      request()
      await settle(300)

      expect(users.value).toEqual([carol, alice])
      expect(entriesByUser.value.has(2)).toBe(false)
      expect(derivedBob.value).toEqual([])
      expect(derivedAlice.value).toEqual([entryB, entryA])
      const cached = await readCache()
      expect(cached?.users.find((u) => u.id === 2)).toEqual(bobTombstone)
      expect(cached?.entries.find((e) => e.id === 201)).toEqual(entryBobTombstone)
    })

    it('falls back to the first user in the new list when the active user is tombstoned', async () => {
      users.value = [alice, bob]
      activeUserId.value = 2
      mockedFetchState.mockResolvedValue({
        users: [alice, bobTombstone],
        entries: [entryA],
      })

      const { request } = useSync()
      request()
      await settle(300)

      expect(users.value).toEqual([alice])
      expect(activeUserId.value).toBe(1)
    })

    it('replaces the entriesByUser Map instance on every sync', async () => {
      entriesByUser.value = new Map([[1, [entryA]]])
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA] })
      const before = entriesByUser.value

      const { request } = useSync()
      request()
      await settle(300)

      expect(entriesByUser.value).not.toBe(before)
      expect(entriesByUser.value.get(1)).toEqual([entryA])
    })
  })

  describe('pause, timer, and failure behavior', () => {
    it('performs no fetch while paused and resumes on the next trigger', async () => {
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA] })
      const { request, setPaused } = useSync()

      request()
      setPaused(true)
      await settle(60000)
      expect(mockedFetchState).not.toHaveBeenCalled()

      setPaused(false)
      request()
      await settle(300)
      expect(mockedFetchState).toHaveBeenCalledTimes(1)
    })

    it('runs the 60s interval only while the document is visible', async () => {
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA] })
      const visibilitySpy = vi
        .spyOn(document, 'visibilityState', 'get')
        .mockReturnValue('visible')
      const { start, stop } = useSync()

      start()
      await settle(300)
      expect(mockedFetchState).toHaveBeenCalledTimes(1)

      await settle(60000)
      expect(mockedFetchState).toHaveBeenCalledTimes(2)

      visibilitySpy.mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      await settle(120000)
      expect(mockedFetchState).toHaveBeenCalledTimes(2)

      visibilitySpy.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await settle(300)
      expect(mockedFetchState).toHaveBeenCalledTimes(3)

      await settle(60000)
      expect(mockedFetchState).toHaveBeenCalledTimes(4)

      stop()
      await settle(120000)
      expect(mockedFetchState).toHaveBeenCalledTimes(4)

      visibilitySpy.mockRestore()
    })

    it('treats a fetchState rejection as a silent no-op and retries on the next trigger', async () => {
      mockedFetchState
        .mockRejectedValueOnce(new Error('server unreachable'))
        .mockResolvedValue({ users: [alice], entries: [entryB] })
      users.value = [alice]
      entriesByUser.value = new Map([[1, [entryA]]])
      const mapBefore = entriesByUser.value
      await (await import('../../src/frontend/cache.js')).writeCache({
        users: [alice],
        entries: [entryA],
      })
      const derived = entriesFor(1)

      const { request } = useSync()
      request()
      await settle(300)

      expect(mockedFetchState).toHaveBeenCalledTimes(1)
      expect(users.value).toEqual([alice])
      expect(entriesByUser.value).toBe(mapBefore)
      expect(derived.value).toEqual([entryA])
      const cachedAfterFailure = await readCache()
      expect(cachedAfterFailure?.users).toEqual([alice])
      expect(cachedAfterFailure?.entries).toEqual([entryA])

      request()
      await settle(300)

      expect(mockedFetchState).toHaveBeenCalledTimes(2)
      expect(derived.value).toEqual([entryB])
    })
  })

  describe('mutation wiring', () => {
    it('triggers a background sync after a successful mutation', async () => {
      mockedFetchState.mockResolvedValue({ users: [alice], entries: [entryA] })
      const created: Entry = { ...entryB, id: 105 }
      mockedCreateEntry.mockResolvedValue(created)
      const { addEntry } = useEntries(1)

      const result = await addEntry({ timestamp: '2024-01-16T10:00:00.000Z', weight_kg: 71.0 })
      expect(result).toEqual(created)
      expect(mockedFetchState).not.toHaveBeenCalled()

      await settle(300)
      expect(mockedFetchState).toHaveBeenCalledTimes(1)
    })
  })
})
