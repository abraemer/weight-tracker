import { ref, computed } from 'vue'
import { fetchUsers, createUser } from '../api.js'
import type { User, NewUser } from '../types/index.js'

const users = ref<User[]>([])
const activeUserId = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

export function resetUsersState(): void {
  users.value = []
  activeUserId.value = null
  loading.value = false
  error.value = null
}

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
    addUser,
    setActiveUser,
  }
}
