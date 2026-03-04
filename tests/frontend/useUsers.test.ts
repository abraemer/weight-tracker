import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/frontend/api.js', () => ({
  fetchUsers: vi.fn(),
  createUser: vi.fn(),
}))

import { fetchUsers, createUser } from '../../src/frontend/api.js'
import { useUsers, resetUsersState } from '../../src/frontend/composables/useUsers.js'

const mockedFetchUsers = vi.mocked(fetchUsers)
const mockedCreateUser = vi.mocked(createUser)

describe('useUsers composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetUsersState()
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
