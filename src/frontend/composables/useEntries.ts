import { ref } from 'vue'
import { fetchEntries, createEntry, updateEntry, deleteEntry } from '../api.js'
import type { Entry, NewEntry, UpdateEntry } from '../types/index.js'

const entriesByUser = ref<Map<number, Entry[]>>(new Map())
const loading = ref(false)
const error = ref<string | null>(null)

export function useEntries(userId: number | null) {
  const entries = ref<Entry[]>([])

  async function loadEntries(): Promise<void> {
    if (userId === null) {
      entries.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const loadedEntries = await fetchEntries(userId)
      entriesByUser.value.set(userId, loadedEntries)
      entries.value = loadedEntries
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load entries'
    } finally {
      loading.value = false
    }
  }

  async function addEntry(data: NewEntry): Promise<Entry | null> {
    if (userId === null) return null
    loading.value = true
    error.value = null
    try {
      const entry = await createEntry(userId, data)
      const userEntries = entriesByUser.value.get(userId) ?? []
      userEntries.unshift(entry)
      entriesByUser.value.set(userId, [...userEntries])
      entries.value = userEntries
      return entry
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create entry'
      return null
    } finally {
      loading.value = false
    }
  }

  async function editEntry(id: number, data: UpdateEntry): Promise<Entry | null> {
    if (userId === null) return null
    loading.value = true
    error.value = null
    try {
      const entry = await updateEntry(id, data)
      const userEntries = entriesByUser.value.get(userId)
      if (userEntries) {
        const index = userEntries.findIndex((e) => e.id === id)
        if (index >= 0) {
          userEntries[index] = entry
          entriesByUser.value.set(userId, [...userEntries])
          entries.value = [...userEntries]
        }
      }
      return entry
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update entry'
      return null
    } finally {
      loading.value = false
    }
  }

  async function removeEntry(id: number): Promise<boolean> {
    if (userId === null) return false
    loading.value = true
    error.value = null
    try {
      await deleteEntry(id)
      const userEntries = entriesByUser.value.get(userId)
      if (userEntries) {
        const filtered = userEntries.filter((e) => e.id !== id)
        entriesByUser.value.set(userId, filtered)
        entries.value = filtered
      }
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete entry'
      return false
    } finally {
      loading.value = false
    }
  }

  function refreshFromCache(): void {
    if (userId === null) {
      entries.value = []
    } else {
      entries.value = entriesByUser.value.get(userId) ?? []
    }
  }

  return {
    entries,
    loading,
    error,
    loadEntries,
    addEntry,
    editEntry,
    removeEntry,
    refreshFromCache,
  }
}
