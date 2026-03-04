<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      Weight Entries
      <v-spacer />
      <v-btn v-if="!showNewRow" color="primary" prepend-icon="mdi-plus" @click="addNewRow">
        Add Entry
      </v-btn>
    </v-card-title>

    <v-table v-if="entries.length > 0 || showNewRow" class="weight-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Time</th>
          <th>Weight (kg)</th>
          <th style="width: 120px"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="showNewRow" class="new-entry-row">
          <td>
            <v-text-field
              v-model="newDate"
              type="date"
              density="compact"
              variant="outlined"
              hide-details
            />
          </td>
          <td>
            <v-text-field
              v-model="newTime"
              type="time"
              density="compact"
              variant="outlined"
              hide-details
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
            <v-btn icon size="small" variant="text" @click="cancelNewEntry">
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </td>
        </tr>

        <EntryRow
          v-for="entry in sortedEntries"
          :key="entry.id"
          :entry="entry"
          @update="handleUpdate"
          @delete="handleDelete"
        />
      </tbody>
    </v-table>

    <v-card-text v-else class="text-center text-medium-emphasis py-8">
      <v-icon size="64" color="grey-lighten-1">mdi-scale-bathroom</v-icon>
      <p class="mt-4">No weight entries yet</p>
      <v-btn color="primary" class="mt-4" @click="addNewRow">Add Your First Entry</v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { getCurrentLocalDateTime, localToUtc } from '../api.js'
import type { Entry, UpdateEntry, NewEntry } from '../types/index.js'
import EntryRow from './EntryRow.vue'

const props = defineProps<{
  entries: Entry[]
}>()

const emit = defineEmits<{
  create: [data: NewEntry]
  update: [id: number, data: UpdateEntry]
  delete: [id: number]
}>()

const showNewRow = ref(false)
const newDate = ref('')
const newTime = ref('')
const newWeight = ref<number | null>(null)
const saving = ref(false)

const sortedEntries = computed(() => {
  return [...props.entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
})

const isNewValid = computed(() => {
  return newDate.value && newTime.value && newWeight.value !== null && newWeight.value > 0
})

function addNewRow(): void {
  const now = getCurrentLocalDateTime()
  const parts = now.split('T')
  newDate.value = parts[0] ?? ''
  newTime.value = parts[1] ?? ''
  newWeight.value = null
  showNewRow.value = true
}

function cancelNewEntry(): void {
  showNewRow.value = false
  newDate.value = ''
  newTime.value = ''
  newWeight.value = null
}

async function saveNewEntry(): Promise<void> {
  if (!isNewValid.value || newWeight.value === null) return

  const localDateTime = `${newDate.value}T${newTime.value}`
  const utcTimestamp = localToUtc(localDateTime)

  saving.value = true
  emit('create', {
    timestamp: utcTimestamp,
    weight_kg: newWeight.value,
  })
  saving.value = false
  showNewRow.value = false
  newDate.value = ''
  newTime.value = ''
  newWeight.value = null
}

function handleUpdate(id: number, data: UpdateEntry): void {
  emit('update', id, data)
}

function handleDelete(id: number): void {
  emit('delete', id)
}
</script>

<style scoped>
.weight-table {
  max-height: 60vh;
  overflow-y: auto;
}

.new-entry-row {
  background-color: rgb(var(--v-theme-surface-variant));
}
</style>
