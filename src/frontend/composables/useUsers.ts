import { ref, computed } from 'vue'
import { fetchUsers, createUser } from '../api.js'
import { readCache, upsertUsers, type CacheState } from '../cache.js'
import { request as requestSync } from './useSync.js'
import type { User, NewUser } from '../types/index.js'

export const users = ref<User[]>([])
export const activeUserId = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

export function resetUsersState(): void {
  users.value = []
  activeUserId.value = null
  loading.value = false
  error.value = null
}

function restoreActiveUser(cached: User[]): void {
  const stored = window.localStorage.getItem('activeUserId')
  const storedId = stored === null ? Number.NaN : Number.parseInt(stored, 10)
  activeUserId.value = cached.find((u) => u.id === storedId)?.id ?? cached[0]?.id ?? null
}

export function useUsers() {
  const activeUser = computed(() => {
    if (activeUserId.value === null) return null
    return users.value.find((u) => u.id === activeUserId.value) || null
  })

  async function loadUsers(): Promise<void> {
    const cached: CacheState | null = await readCache().catch(() => null)

    if (cached !== null) {
      users.value = cached.users
        .filter((u) => !u.deleted)
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
      restoreActiveUser(users.value)
      loading.value = false
      error.value = null
      requestSync()
      return
    }

    loading.value = true
    error.value = null

    try {
      const fetched = await fetchUsers()
      users.value = fetched
      if (activeUserId.value === null && users.value.length > 0) {
        activeUserId.value = users.value[0]!.id
      }
      await upsertUsers(fetched).catch(() => undefined)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load users'
    } finally {
      loading.value = false
    }
  }

  async function addUser(data: NewUser): Promise<User | null> {
    loading.value = true
    error.value = null
    try {
      const user = await createUser(data)
      users.value.push(user)
      await upsertUsers([user]).catch(() => undefined)
      requestSync()
      return user
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create user'
      return null
    } finally {
      loading.value = false
    }
  }

  function setActiveUser(id: number): void {
    activeUserId.value = id
  }

  return {
    users,
    activeUserId,
    activeUser,
    loading,
    error,
    loadUsers,
    addUser,
    setActiveUser,
  }
}
