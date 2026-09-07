import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

const { setCacheOpenFailed, isCacheOpenFailed } = vi.hoisted(() => {
  let failed = false
  return {
    setCacheOpenFailed: (value: boolean): void => {
      failed = value
    },
    isCacheOpenFailed: (): boolean => failed,
  }
})

vi.mock('idb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('idb')>()
  return {
    ...actual,
    openDB: (...args: Parameters<typeof actual.openDB>) =>
      isCacheOpenFailed()
        ? Promise.reject(new Error('corrupt database'))
        : actual.openDB(...args),
  }
})

vi.mock('../../src/frontend/api.js', () => ({
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
  fetchState: vi.fn(),
}))

import { fetchUsers, createUser, fetchState } from '../../src/frontend/api.js'
import { useUsers, resetUsersState } from '../../src/frontend/composables/useUsers.js'
import { resetSyncState } from '../../src/frontend/composables/useSync.js'
import { writeCache, clearCache } from '../../src/frontend/cache.js'
import type { User } from '../../src/frontend/types/index.js'

const mockedFetchUsers = vi.mocked(fetchUsers)
const mockedCreateUser = vi.mocked(createUser)
const mockedFetchState = vi.mocked(fetchState)

const alice: User = {
  id: 1,
  name: 'Alice',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  deleted: false,
}
const bob: User = {
  id: 2,
  name: 'Bob',
  created_at: '2024-01-02T00:00:00.000Z',
  updated_at: '2024-01-02T00:00:00.000Z',
  deleted: false,
}
const ghost: User = {
  id: 3,
  name: 'Ghost',
  created_at: '2024-01-03T00:00:00.000Z',
  updated_at: '2024-01-03T00:00:00.000Z',
  deleted: true,
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

describe('useUsers composable', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetUsersState()
    resetSyncState()
    window.localStorage.clear()
    await clearCache()
  })

  describe('loadUsers', () => {
    it('loads users and sets the first user as active', async () => {
      const mockUsers = [
        { id: 1, name: 'Alice', created_at: '2024-01-01T00:00:00Z' },
        { id: 2, name: 'Bob', created_at: '2024-01-02T00:00:00Z' },
      ]
      mockedFetchUsers.mockResolvedValue(mockUsers)

      const { users, activeUserId, loadUsers } = useUsers()

      await loadUsers()

      expect(users.value).toEqual(mockUsers)
      expect(activeUserId.value).toBe(1)
    })

    it('handles empty user list', async () => {
      mockedFetchUsers.mockResolvedValue([])

      const { users, activeUserId, loadUsers } = useUsers()
      await loadUsers()

      expect(users.value).toEqual([])
      expect(activeUserId.value).toBe(null)
    })

    it('sets error on failure', async () => {
      mockedFetchUsers.mockRejectedValue(new Error('Network error'))

      const { error, loadUsers } = useUsers()
      await loadUsers()

      expect(error.value).toBe('Network error')
    })
  })

  describe('loadUsers cache-first', () => {
    it('renders users from a warm cache instantly and schedules a background sync instead of a direct fetch', async () => {
      await writeCache({ users: [ghost, bob, alice], entries: [] })
      window.localStorage.setItem('activeUserId', '2')
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))

      const { users, activeUserId, loading, loadUsers } = useUsers()
      void loadUsers()

      await vi.waitFor(() => {
        expect(users.value).toEqual([alice, bob])
      })
      expect(loading.value).toBe(false)
      expect(activeUserId.value).toBe(2)
      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
      expect(mockedFetchUsers).not.toHaveBeenCalled()
    })

    it('renders an empty user list instantly from a warm cache with zero users', async () => {
      await writeCache({ users: [], entries: [] })
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))

      const { users, activeUserId, loading, loadUsers } = useUsers()
      void loadUsers()

      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
      expect(users.value).toEqual([])
      expect(loading.value).toBe(false)
      expect(activeUserId.value).toBe(null)
      expect(mockedFetchUsers).not.toHaveBeenCalled()
    })

    it('falls back to the first user when the stored activeUserId is not in the cached users', async () => {
      await writeCache({ users: [bob, alice], entries: [] })
      window.localStorage.setItem('activeUserId', '999')
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))

      const { users, activeUserId, loadUsers } = useUsers()
      void loadUsers()

      await vi.waitFor(() => {
        expect(users.value).toEqual([alice, bob])
      })
      expect(activeUserId.value).toBe(1)
      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
      expect(mockedFetchUsers).not.toHaveBeenCalled()
    })

    it('selects the first user when no activeUserId is stored', async () => {
      await writeCache({ users: [bob, alice], entries: [] })
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))

      const { users, activeUserId, loadUsers } = useUsers()
      void loadUsers()

      await vi.waitFor(() => {
        expect(users.value).toEqual([alice, bob])
      })
      expect(activeUserId.value).toBe(1)
      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
      expect(mockedFetchUsers).not.toHaveBeenCalled()
    })

    it('keeps the cold-cache network path with spinner flags', async () => {
      let resolveFetch: (value: User[]) => void = () => {}
      const pending = new Promise<User[]>((resolve) => {
        resolveFetch = resolve
      })
      mockedFetchUsers.mockReturnValue(pending)

      const { users, activeUserId, loading, loadUsers } = useUsers()
      const promise = loadUsers()

      await vi.waitFor(() => {
        expect(loading.value).toBe(true)
      })
      expect(users.value).toEqual([])

      resolveFetch([alice, bob])
      await promise

      expect(users.value).toEqual([alice, bob])
      expect(loading.value).toBe(false)
      expect(activeUserId.value).toBe(1)
    })

    it('writes successful network results to the cache', async () => {
      mockedFetchUsers.mockResolvedValue([alice, bob])

      const { users, loadUsers } = useUsers()
      await loadUsers()

      expect(users.value).toEqual([alice, bob])
      const db = await openRaw()
      const stored = await readStoreAll<User>(db, 'users')
      db.close()
      expect(stored).toEqual([alice, bob])
    })

    it('falls back to the network path without crashing when the cache cannot be opened', async () => {
      setCacheOpenFailed(true)
      vi.resetModules()
      const { fetchUsers: freshFetchUsers } = await import('../../src/frontend/api.js')
      vi.mocked(freshFetchUsers).mockResolvedValue([alice, bob])
      const { useUsers: freshUseUsers } = await import('../../src/frontend/composables/useUsers.js')

      const { users, loading, error, loadUsers } = freshUseUsers()
      await loadUsers()

      expect(users.value).toEqual([alice, bob])
      expect(loading.value).toBe(false)
      expect(error.value).toBe(null)
      setCacheOpenFailed(false)
    })
  })

  describe('addUser', () => {
    it('creates a new user and adds to list', async () => {
      const existingUsers = [{ id: 1, name: 'Alice', created_at: '2024-01-01T00:00:00Z' }]
      mockedFetchUsers.mockResolvedValue(existingUsers)

      const newUser = { id: 2, name: 'Bob', created_at: '2024-01-02T00:00:00Z' }
      mockedCreateUser.mockResolvedValue(newUser)

      const { users, addUser, loadUsers } = useUsers()
      await loadUsers()

      const result = await addUser({ name: 'Bob' })

      expect(result).toEqual(newUser)
      expect(users.value).toHaveLength(2)
      expect(users.value[1]).toEqual(newUser)
    })

    it('requests a background sync after a successful user creation', async () => {
      mockedFetchState.mockImplementation(() => new Promise<never>(() => {}))
      mockedCreateUser.mockResolvedValue(bob)

      const { addUser } = useUsers()
      const result = await addUser({ name: 'Bob' })

      expect(result).toEqual(bob)
      await vi.waitFor(() => {
        expect(mockedFetchState).toHaveBeenCalledTimes(1)
      })
    })

    it('returns null on creation failure', async () => {
      mockedCreateUser.mockRejectedValue(new Error('Creation failed'))

      const { addUser, error } = useUsers()
      const result = await addUser({ name: 'Bob' })

      expect(result).toBe(null)
      expect(error.value).toBe('Creation failed')
    })
  })

  describe('setActiveUser', () => {
    it('sets the active user id', () => {
      const { activeUserId, setActiveUser } = useUsers()

      setActiveUser(5)
      expect(activeUserId.value).toBe(5)
    })
  })

  describe('activeUser computed', () => {
    it('returns the active user from the list', async () => {
      const mockUsers = [
        { id: 1, name: 'Alice', created_at: '2024-01-01T00:00:00Z' },
        { id: 2, name: 'Bob', created_at: '2024-01-02T00:00:00Z' },
      ]
      mockedFetchUsers.mockResolvedValue(mockUsers)

      const { activeUser, loadUsers, setActiveUser } = useUsers()
      await loadUsers()
      setActiveUser(2)

      expect(activeUser.value?.name).toBe('Bob')
    })

    it('returns null when no active user is set', async () => {
      mockedFetchUsers.mockResolvedValue([])

      const { activeUser, loadUsers } = useUsers()
      await loadUsers()
      expect(activeUser.value).toBe(null)
    })
  })
})
