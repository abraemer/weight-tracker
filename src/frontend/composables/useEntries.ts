import { ref } from 'vue'
import { fetchEntries, createEntry, updateEntry, deleteEntry } from '../api.js'
import type { Entry, NewEntry, UpdateEntry } from '../types/index.js'

const entriesByUser = ref<Map<number, Entry[]>>(new Map())
const loading = ref(false)
const error = ref<string | null>(null)
const operationLoading = ref(new Map<string, boolean>())

export function resetEntriesState(): void {
  entriesByUser.value = new Map()
  loading.value = false
  error.value = null
  operationLoading.value = new Map()
}

export function useEntries(userId: number | null) {
  const entries = ref<Entry[]>([])

  async function loadEntries(targetUserId?: number): Promise<void> {
    const effectiveUserId = targetUserId ?? userId
    if (effectiveUserId === null) {
      entries.value = []
      return
    }
    loading.value = true
    error.value = null
    try {
      const loadedEntries = await fetchEntries(effectiveUserId)
      entriesByUser.value.set(effectiveUserId, loadedEntries)
      entries.value = loadedEntries
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load entries'
    } finally {
      loading.value = false
    }
  }

  async function addEntry(data: NewEntry, targetUserId?: number): Promise<Entry | null> {
    const effectiveUserId = targetUserId ?? userId
    if (effectiveUserId === null) return null
    const opKey = `add-${effectiveUserId}`
    operationLoading.value.set(opKey, true)
    error.value = null

    const tempId = -Date.now()
    const tempEntry: Entry = {
      id: tempId,
      user_id: effectiveUserId,
      timestamp: data.timestamp,
      weight_kg: data.weight_kg,
      created_at: new Date().toISOString(),
    }

    const userEntries = entriesByUser.value.get(effectiveUserId) ?? []
    const previousEntries = [...userEntries]
    userEntries.unshift(tempEntry)
    entriesByUser.value.set(effectiveUserId, [...userEntries])
    entries.value = [...userEntries]

    try {
      const entry = await createEntry(effectiveUserId, data)
      const currentEntries = entriesByUser.value.get(effectiveUserId)
      if (currentEntries) {
        const index = currentEntries.findIndex((e) => e.id === tempId)
        if (index >= 0) {
          currentEntries[index] = entry
          entriesByUser.value.set(effectiveUserId, [...currentEntries])
          entries.value = [...currentEntries]
        }
      }
      return entry
    } catch (e) {
      entriesByUser.value.set(effectiveUserId, previousEntries)
      entries.value = previousEntries
      error.value = e instanceof Error ? e.message : 'Failed to create entry'
      return null
    } finally {
      operationLoading.value.delete(opKey)
    }
  }

  async function editEntry(
    id: number,
    data: UpdateEntry,
    targetUserId?: number
  ): Promise<Entry | null> {
    const effectiveUserId = targetUserId ?? userId
    if (effectiveUserId === null) return null
    const opKey = `edit-${id}`
    operationLoading.value.set(opKey, true)
    error.value = null

    const userEntries = entriesByUser.value.get(effectiveUserId)
    const previousEntries = userEntries ? [...userEntries] : []
    const existingIndex = userEntries?.findIndex((e) => e.id === id)

    if (userEntries && existingIndex !== undefined && existingIndex >= 0) {
      userEntries[existingIndex] = {
        ...userEntries[existingIndex]!,
        ...data,
      }
      entriesByUser.value.set(effectiveUserId, [...userEntries])
      entries.value = [...userEntries]
    }

    try {
      const entry = await updateEntry(id, data)
      const currentEntries = entriesByUser.value.get(effectiveUserId)
      if (currentEntries) {
        const index = currentEntries.findIndex((e) => e.id === id)
        if (index >= 0) {
          currentEntries[index] = entry
          entriesByUser.value.set(effectiveUserId, [...currentEntries])
          entries.value = [...currentEntries]
        }
      }
      return entry
    } catch (e) {
      entriesByUser.value.set(effectiveUserId, previousEntries)
      entries.value = previousEntries
      error.value = e instanceof Error ? e.message : 'Failed to update entry'
      return null
    } finally {
      operationLoading.value.delete(opKey)
    }
  }

  async function removeEntry(id: number, targetUserId?: number): Promise<boolean> {
    const effectiveUserId = targetUserId ?? userId
    if (effectiveUserId === null) return false
    const opKey = `delete-${id}`
    operationLoading.value.set(opKey, true)
    error.value = null

    const userEntries = entriesByUser.value.get(effectiveUserId)
    const previousEntries = userEntries ? [...userEntries] : []

    if (userEntries) {
      const filtered = userEntries.filter((e) => e.id !== id)
      entriesByUser.value.set(effectiveUserId, filtered)
      entries.value = filtered
    }

    try {
      await deleteEntry(id)
      return true
    } catch (e) {
      entriesByUser.value.set(effectiveUserId, previousEntries)
      entries.value = previousEntries
      error.value = e instanceof Error ? e.message : 'Failed to delete entry'
      return false
    } finally {
      operationLoading.value.delete(opKey)
    }
  }

  function refreshFromCache(): void {
    if (userId === null) {
      entries.value = []
    } else {
      entries.value = entriesByUser.value.get(userId) ?? []
    }
  }

  function isOperationLoading(key: string): boolean {
    return operationLoading.value.get(key) ?? false
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
    isOperationLoading,
  }
}
