<template>
  <v-app>
    <v-main>
      <v-container>
        <h1 class="text-h4 mb-4">Weight Tracker</h1>

        <UserTabs
          v-if="users.length > 0"
          v-model="activeUserId!"
          :users="users"
          @add-user="showAddDialog = true"
        />

        <div v-if="loading" class="d-flex justify-center my-4">
          <v-progress-circular indeterminate />
        </div>

        <UserView v-else-if="activeUser" :user-id="activeUser.id" class="mt-4" />
      </v-container>
    </v-main>

    <AddUserDialog v-model="showAddDialog" @create="handleCreateUser" />

    <v-snackbar v-model="snackbar.show" :color="snackbar.color">
      {{ snackbar.message }}
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useUsers } from './composables/useUsers.js'
import { setErrorHandler } from './api.js'
import UserTabs from './components/UserTabs.vue'
import AddUserDialog from './components/AddUserDialog.vue'
import UserView from './components/UserView.vue'

const { users, activeUserId, activeUser, loading, loadUsers, addUser, setActiveUser } = useUsers()

const showAddDialog = ref(false)
const hasLoadedOnce = ref(false)

const snackbar = ref({
  show: false,
  message: '',
  color: 'error',
})

setErrorHandler((message: string) => {
  snackbar.value = {
    show: true,
    message,
    color: 'error',
  }
})

async function handleCreateUser(name: string): Promise<void> {
  const user = await addUser({ name })
  if (user) {
    showAddDialog.value = false
    setActiveUser(user.id)
    snackbar.value = {
      show: true,
      message: `User "${user.name}" created`,
      color: 'success',
    }
  }
}

onMounted(async () => {
  await loadUsers()
  hasLoadedOnce.value = true
  if (users.value.length === 0) {
    showAddDialog.value = true
  }
})

watch(activeUserId, (newId) => {
  if (newId !== null) {
    window.localStorage.setItem('activeUserId', String(newId))
  }
})

watch(
  () => users.value.length,
  (newLength, oldLength) => {
    if (hasLoadedOnce.value && newLength === 0 && oldLength !== undefined && oldLength > 0) {
      showAddDialog.value = true
    }
  }
)
</script>
