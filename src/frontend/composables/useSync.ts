import { fetchState } from '../api.js'
import { writeCache } from '../cache.js'
import { users, activeUserId } from './useUsers.js'
import { entriesByUser, operationLoading } from './useEntries.js'
import type { Entry, User } from '../types/index.js'

const DEBOUNCE_MS = 300
const INTERVAL_MS = 60000

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let intervalTimer: ReturnType<typeof setInterval> | null = null
let syncing = false
let dirty = false
let paused = false
let started = false

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    startInterval()
    request()
  } else {
    stopInterval()
  }
}

export function request(): void {
  if (paused) return
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runSync()
  }, DEBOUNCE_MS)
}

export function setPaused(value: boolean): void {
  paused = value
  if (value && debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

function startInterval(): void {
  stopInterval()
  if (document.visibilityState !== 'visible') return
  intervalTimer = setInterval(() => {
    request()
  }, INTERVAL_MS)
}

function stopInterval(): void {
  if (intervalTimer !== null) {
    clearInterval(intervalTimer)
    intervalTimer = null
  }
}

export function start(): void {
  if (started) return
  started = true
  document.addEventListener('visibilitychange', handleVisibilityChange)
  startInterval()
  request()
}

export function stop(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  stopInterval()
  if (started) {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    started = false
  }
}

export function resetSyncState(): void {
  stop()
  syncing = false
  dirty = false
  paused = false
}

async function runSync(): Promise<void> {
  if (paused) return
  if (syncing) {
    dirty = true
    return
  }
  syncing = true
  try {
    const state = await fetchState()
    await writeCache(state).catch(() => undefined)
    applyState(state)
  } catch {
    console.debug('background sync failed')
  } finally {
    syncing = false
    if (dirty) {
      dirty = false
      void runSync()
    }
  }
}

function applyState(state: { users: User[]; entries: Entry[] }): void {
  const previous = entriesByUser.value
  const tempRows: Entry[] = []
  const editingRows = new Map<number, Entry>()
  const editingIds = new Set<number>()
  const deletingIds = new Set<number>()
  for (const key of operationLoading.value.keys()) {
    if (key.startsWith('edit-')) editingIds.add(Number(key.slice('edit-'.length)))
    else if (key.startsWith('delete-')) deletingIds.add(Number(key.slice('delete-'.length)))
  }
  for (const list of previous.values()) {
    for (const row of list) {
      if (row.id < 0) tempRows.push(row)
      else if (editingIds.has(row.id)) editingRows.set(row.id, row)
    }
  }

  const grouped = new Map<number, Entry[]>()
  const pushRow = (row: Entry): void => {
    const list = grouped.get(row.user_id)
    if (list === undefined) grouped.set(row.user_id, [row])
    else list.push(row)
  }
  const seenEditingIds = new Set<number>()
  for (const entry of state.entries) {
    if (entry.deleted || deletingIds.has(entry.id)) continue
    const local = editingRows.get(entry.id)
    if (local !== undefined) {
      seenEditingIds.add(entry.id)
      pushRow(local)
    } else {
      pushRow(entry)
    }
  }
  for (const row of tempRows) pushRow(row)
  for (const [id, row] of editingRows) {
    if (!seenEditingIds.has(id)) pushRow(row)
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }
  entriesByUser.value = grouped

  users.value = state.users
    .filter((u) => !u.deleted)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
  if (!users.value.some((u) => u.id === activeUserId.value)) {
    activeUserId.value = users.value[0]?.id ?? null
  }
}

export function useSync() {
  return { request, start, stop, setPaused }
}
