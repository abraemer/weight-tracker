import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'

vi.mock('../../src/frontend/api.js', () => ({
  fetchEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}))

import { fetchEntries, createEntry, updateEntry, deleteEntry } from '../../src/frontend/api.js'
import { useEntries, resetEntriesState } from '../../src/frontend/composables/useEntries.js'

const mockedFetchEntries = vi.mocked(fetchEntries)
const mockedCreateEntry = vi.mocked(createEntry)
const mockedUpdateEntry = vi.mocked(updateEntry)
const mockedDeleteEntry = vi.mocked(deleteEntry)

describe('useEntries composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetEntriesState()
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

      const { entries, loading, loadEntries } = useEntries(10)
      await loadEntries()

      expect(loading.value).toBe(false)
      expect(entries.value).toEqual(mockEntries)
    })

    it('handles null userId', async () => {
      const { entries, loadEntries } = useEntries(null)
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

      const { entries, addEntry, loadEntries } = useEntries(20)
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

      const { entries, addEntry, loadEntries, error } = useEntries(21)
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
      mockedUpdateEntry.mockResolvedValue(updatedEntry)

      const { entries, editEntry, loadEntries } = useEntries(30)
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

      const { entries, editEntry, loadEntries, error } = useEntries(31)
      await loadEntries()
      const originalEntry = { ...entries.value.find((e) => e.id === 101)! }

      const result = await editEntry(101, { weight_kg: 999 })

      expect(result).toBe(null)
      expect(entries.value.find((e) => e.id === 101)).toEqual(originalEntry)
      expect(error.value).toBe('Update failed')
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
      mockedDeleteEntry.mockResolvedValue(undefined)

      const { entries, removeEntry, loadEntries } = useEntries(40)
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

      const { entries, removeEntry, loadEntries, error } = useEntries(41)
      await loadEntries()
      const originalLength = entries.value.length

      const result = await removeEntry(202)

      expect(result).toBe(false)
      expect(entries.value).toHaveLength(originalLength)
      expect(error.value).toBe('Delete failed')
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
