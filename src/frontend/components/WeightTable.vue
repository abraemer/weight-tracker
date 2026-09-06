<template>
  <v-card>
    <v-card-title> Weight Entries </v-card-title>

    <v-table class="weight-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Time</th>
          <th>Weight (kg)</th>
          <th style="width: 120px"></th>
        </tr>
      </thead>
      <tbody>
        <tr class="new-entry-row">
          <td>
            <v-text-field
              v-model="newDate"
              type="date"
              density="compact"
              variant="outlined"
              hide-details
              :error="validationErrors.date"
            />
          </td>
          <td>
            <v-text-field
              v-model="newTime"
              type="time"
              density="compact"
              variant="outlined"
              hide-details
              :error="validationErrors.time"
            />
          </td>
          <td>
            <v-text-field
              v-model.number="newWeight"
              type="number"
              density="compact"
              variant="outlined"
              hide-details
              step="0.1"
              :error="validationErrors.weight"
              @keyup.enter="saveNewEntry"
            />
          </td>
          <td class="text-right" style="white-space: nowrap">
            <v-btn
              icon
              size="small"
              variant="text"
              color="primary"
              :disabled="!isNewValid"
              :loading="saving"
              @click="saveNewEntry"
            >
              <v-icon>mdi-check</v-icon>
            </v-btn>
            <v-btn icon size="small" variant="text" :disabled="saving" @click="clearNewEntry">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </td>
        </tr>

        <EntryRow
          v-for="entry in sortedEntries"
          :key="entry.id"
          :entry="entry"
          :saving-edit="editLoading(entry.id)"
          :saving-delete="deleteLoading(entry.id)"
          @update="handleUpdate"
          @delete="handleDelete"
        />
      </tbody>
    </v-table>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getCurrentLocalDateTime, localToUtc } from '../api.js'
import type { Entry, UpdateEntry, NewEntry } from '../types/index.js'
import EntryRow from './EntryRow.vue'

const props = defineProps<{
  entries: Entry[]
  saving?: boolean
  editLoading: (id: number) => boolean
  deleteLoading: (id: number) => boolean
}>()

const emit = defineEmits<{
  create: [data: NewEntry]
  update: [id: number, data: UpdateEntry]
  delete: [id: number]
}>()

const newDate = ref('')
const newTime = ref('')
const newWeight = ref<number | null>(null)

const sortedEntries = computed(() => {
  return [...props.entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
})

const validationErrors = computed(() => ({
  date: !newDate.value,
  time: !newTime.value,
  weight: newWeight.value === null || newWeight.value <= 0,
}))

const isNewValid = computed(() => {
  return newDate.value && newTime.value && newWeight.value !== null && newWeight.value > 0
})

function initNewEntry(): void {
  const now = getCurrentLocalDateTime()
  const parts = now.split('T')
  newDate.value = parts[0] ?? ''
  newTime.value = parts[1] ?? ''
  newWeight.value = null
}

function clearNewEntry(): void {
  newDate.value = ''
  newTime.value = ''
  newWeight.value = null
}

async function saveNewEntry(): Promise<void> {
  if (!isNewValid.value || newWeight.value === null) return

  const localDateTime = `${newDate.value}T${newTime.value}`
  const utcTimestamp = localToUtc(localDateTime)

  emit('create', {
    timestamp: utcTimestamp,
    weight_kg: newWeight.value,
  })
  initNewEntry()
}

function handleUpdate(id: number, data: UpdateEntry): void {
  emit('update', id, data)
}

function handleDelete(id: number): void {
  emit('delete', id)
}

onMounted(() => {
  initNewEntry()
})
</script>

<style scoped>
.weight-table {
  max-height: 60vh;
  overflow-y: auto;
}

.new-entry-row {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.new-entry-row :deep(.v-field) {
  background-color: rgb(var(--v-theme-surface));
}
</style>
