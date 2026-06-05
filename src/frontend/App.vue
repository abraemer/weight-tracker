<template>
  <v-app>
    <v-main>
      <v-container>
        <h1 class="text-h4 mb-4">Weight Tracker</h1>

        <UserTabs
          v-if="users.length > 0"
          :model-value="activeUserId!"
          :users="users"
          @update:model-value="setActiveUser"
          @add-user="showAddDialog = true"
        />

        <div v-if="loading" class="d-flex justify-center my-4">
          <v-progress-circular indeterminate />
        </div>

        <UserView v-else-if="activeUser" :user-id="activeUser.id" class="mt-4" />
      </v-container>
    </v-main>

    <AddUserDialog v-if="!sessionExpired" v-model="showAddDialog" @create="handleCreateUser" />

    <v-snackbar v-model="snackbar.show" :color="snackbar.color">
      {{ snackbar.message }}
    </v-snackbar>

    <v-overlay v-model="sessionExpired" persistent class="d-flex justify-center align-center">
      <v-card max-width="400" class="text-center pa-6">
        <v-icon size="64" color="warning" class="mb-4">mdi-lock-clock</v-icon>
        <v-card-title class="text-h6">Session Expired</v-card-title>
        <v-card-text>
          Your login session has expired. Please log in again to continue.
        </v-card-text>
        <v-card-actions class="d-flex flex-column ga-2">
          <v-btn v-if="isPwa" color="primary" variant="elevated" block @click="openLogin">
            Log In
          </v-btn>
          <v-btn v-else color="primary" variant="elevated" block @click="reloadPage">
            Reload Page
          </v-btn>
          <v-btn variant="text" block :loading="checkingSession" @click="retrySession">
            Retry
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-overlay>

    <div class="text-center text-caption text-medium-emphasis mt-4 pb-2">
      {{ buildTime }}
    </div>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useUsers } from './composables/useUsers.js'
import { setErrorHandler, setSessionExpiredHandler, checkSession, isStandalone } from './api.js'
import UserTabs from './components/UserTabs.vue'
import AddUserDialog from './components/AddUserDialog.vue'
import UserView from './components/UserView.vue'

const { users, activeUserId, activeUser, loading, loadUsers, addUser, setActiveUser } = useUsers()

const showAddDialog = ref(false)
const hasLoadedOnce = ref(false)

const buildTime = (window as unknown as Record<string, string>).__BUILD_TIME__ || ''

const snackbar = ref({
  show: false,
  message: '',
  color: 'error',
})

const sessionExpired = ref(false)
const checkingSession = ref(false)
const isPwa = isStandalone()
let pollingTimer: number | null = null

setErrorHandler((message: string) => {
  snackbar.value = {
    show: true,
    message,
    color: 'error',
  }
})

setSessionExpiredHandler(() => {
  sessionExpired.value = true
  startPolling()
})

function openLogin(): void {
  window.open(window.location.href, '_blank')
}

async function reloadPage(): Promise<void> {
  // Unregister the service worker before reloading so the SSO proxy can
  // intercept the navigation. Without this, the SW may serve cached
  // index.html and prevent the redirect to the login page.
  if ('serviceWorker' in window.navigator) {
    const reg = await window.navigator.serviceWorker.getRegistration()
    if (reg) await reg.unregister()
  }
  window.location.href = window.location.origin + window.location.pathname + window.location.search
}

async function retrySession(): Promise<void> {
  checkingSession.value = true
  const valid = await checkSession()
  checkingSession.value = false
  if (valid) {
    recoverSession()
  }
}

function recoverSession(): void {
  sessionExpired.value = false
  stopPolling()
  loadUsers()
}

function startPolling(): void {
  stopPolling()
  pollingTimer = window.setInterval(async () => {
    const valid = await checkSession()
    if (valid) {
      recoverSession()
    }
  }, 5000)
}

function stopPolling(): void {
  if (pollingTimer !== null) {
    window.clearInterval(pollingTimer)
    pollingTimer = null
  }
}

onUnmounted(() => {
  stopPolling()
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
  if (users.value.length === 0 && !sessionExpired.value) {
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
