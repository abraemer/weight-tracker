import { ref, computed } from 'vue'
import type { ComputedRef } from 'vue'
import { fetchEntries, createEntry, updateEntry, deleteEntry } from '../api.js'
import { readCache, upsertEntries, removeEntry as removeCachedEntry, type CacheState } from '../cache.js'
import { request as requestSync } from './useSync.js'
import type { Entry, NewEntry, UpdateEntry } from '../types/index.js'

export const entriesByUser = ref<Map<number, Entry[]>>(new Map())
const loading = ref(false)
const error = ref<string | null>(null)
export const operationLoading = ref(new Map<string, boolean>())

export function resetEntriesState(): void {
  entriesByUser.value = new Map()
  loading.value = false
  error.value = null
  operationLoading.value = new Map()
}

export function entriesFor(userId: number): ComputedRef<Entry[]> {
  return computed(() => entriesByUser.value.get(userId) ?? [])
}

async function adoptEntryRow(targetUserId: number, row: Entry): Promise<void> {
  const currentEntries = entriesByUser.value.get(targetUserId)
  if (currentEntries === undefined) {
    entriesByUser.value.set(targetUserId, [row])
  } else {
    const index = currentEntries.findIndex((e) => e.id === row.id)
    const nextEntries =
      index >= 0
        ? currentEntries.map((e) => (e.id === row.id ? row : e))
        : [...currentEntries, row].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    entriesByUser.value.set(targetUserId, nextEntries)
  }
  await upsertEntries([row]).catch(() => undefined)
}

async function adoptEntryRemoval(targetUserId: number, id: number): Promise<void> {
  const currentEntries = entriesByUser.value.get(targetUserId)
  if (currentEntries !== undefined) {
    entriesByUser.value.set(targetUserId, currentEntries.filter((e) => e.id !== id))
  }
  await removeCachedEntry(id).catch(() => undefined)
}

export function useEntries(userId: number | null) {
  async function loadEntries(targetUserId?: number): Promise<void> {
    const effectiveUserId = targetUserId ?? userId
    if (effectiveUserId === null) return
    if (entriesByUser.value.has(effectiveUserId)) return
    const cached: CacheState | null = await readCache().catch(() => null)

    if (cached !== null) {
      const cachedEntries = cached.entries
        .filter((e) => e.user_id === effectiveUserId && !e.deleted)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      entriesByUser.value.set(effectiveUserId, cachedEntries)
      loading.value = false
      error.value = null
      return
    }

    loading.value = true
    error.value = null

    try {
      const loadedEntries = await fetchEntries(effectiveUserId)
      entriesByUser.value.set(effectiveUserId, loadedEntries)
      await upsertEntries(loadedEntries).catch(() => undefined)
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
      updated_at: new Date().toISOString(),
      deleted: false,
    }

    const userEntries = entriesByUser.value.get(effectiveUserId) ?? []
    const previousEntries = [...userEntries]
    entriesByUser.value.set(effectiveUserId, [tempEntry, ...userEntries])

    try {
      const entry = await createEntry(effectiveUserId, data)
      const currentEntries = entriesByUser.value.get(effectiveUserId)
      if (currentEntries !== undefined) {
        const index = currentEntries.findIndex((e) => e.id === tempId)
        if (index >= 0) {
          const nextEntries = [...currentEntries]
          nextEntries[index] = entry
          entriesByUser.value.set(effectiveUserId, nextEntries)
        }
      }
      await upsertEntries([entry]).catch(() => undefined)
      requestSync()
      return entry
    } catch (e) {
      entriesByUser.value.set(effectiveUserId, previousEntries)
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
    const existing = userEntries?.find((e) => e.id === id)
    const previousEntries = userEntries !== undefined ? [...userEntries] : []

    if (userEntries !== undefined && existing !== undefined) {
      entriesByUser.value.set(
        effectiveUserId,
        userEntries.map((e) => (e.id === id ? { ...e, ...data } : e))
      )
    }

    try {
      const result = await updateEntry(id, data, existing?.updated_at)
      switch (result.kind) {
        case 'conflict':
          if (result.entry.deleted) {
            await adoptEntryRemoval(effectiveUserId, id)
          } else {
            await adoptEntryRow(effectiveUserId, result.entry)
          }
          requestSync()
          return null
        case 'gone':
          await adoptEntryRemoval(effectiveUserId, id)
          requestSync()
          return null
        case 'ok': {
          const currentEntries = entriesByUser.value.get(effectiveUserId)
          if (currentEntries !== undefined) {
            const index = currentEntries.findIndex((e) => e.id === id)
            if (index >= 0) {
              const nextEntries = [...currentEntries]
              nextEntries[index] = result.entry
              entriesByUser.value.set(effectiveUserId, nextEntries)
            }
          }
          await upsertEntries([result.entry]).catch(() => undefined)
          requestSync()
          return result.entry
        }
      }
    } catch (e) {
      entriesByUser.value.set(effectiveUserId, previousEntries)
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
    const existing = userEntries?.find((e) => e.id === id)
    const previousEntries = userEntries !== undefined ? [...userEntries] : []

    if (userEntries !== undefined) {
      entriesByUser.value.set(effectiveUserId, userEntries.filter((e) => e.id !== id))
    }

    try {
      const result = await deleteEntry(id, existing?.updated_at)
      switch (result.kind) {
        case 'conflict':
          if (!result.entry.deleted) {
            await adoptEntryRow(effectiveUserId, result.entry)
            requestSync()
            return false
          }
          break
        case 'gone':
        case 'ok':
          break
      }
      await removeCachedEntry(id).catch(() => undefined)
      requestSync()
      return true
    } catch (e) {
      entriesByUser.value.set(effectiveUserId, previousEntries)
      error.value = e instanceof Error ? e.message : 'Failed to delete entry'
      return false
    } finally {
      operationLoading.value.delete(opKey)
    }
  }

  function isOperationLoading(key: string): boolean {
    return operationLoading.value.get(key) ?? false
  }

  return {
    loading,
    error,
    loadEntries,
    addEntry,
    editEntry,
    removeEntry,
    isOperationLoading,
  }
}
