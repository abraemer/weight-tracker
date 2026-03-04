import { ref, computed } from 'vue'
import { fetchUsers, fetchUser, createUser } from '../api.js'
import type { User, NewUser } from '../types/index.js'

const users = ref<User[]>([])
const activeUserId = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

export function useUsers() {
  const activeUser = computed(() => {
    if (activeUserId.value === null) return null
    return users.value.find((u) => u.id === activeUserId.value) || null
  })

  async function loadUsers(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      users.value = await fetchUsers()
      if (activeUserId.value === null && users.value.length > 0) {
        activeUserId.value = users.value[0]!.id
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load users'
    } finally {
      loading.value = false
    }
  }

  async function loadUser(id: number): Promise<User | null> {
    loading.value = true
    error.value = null
    try {
      const user = await fetchUser(id)
      const index = users.value.findIndex((u) => u.id === id)
      if (index >= 0) {
        users.value[index] = user
      } else {
        users.value.push(user)
      }
      return user
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load user'
      return null
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
    loadUser,
    addUser,
    setActiveUser,
  }
}
