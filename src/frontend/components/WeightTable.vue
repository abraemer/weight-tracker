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
          @delete-request="openDeleteDialog"
        />
      </tbody>
    </v-table>

    <v-dialog
      :model-value="pendingDelete !== null"
      max-width="400"
      @update:model-value="onDialogModelUpdate"
    >
      <v-card>
        <v-card-title>Delete Entry</v-card-title>
        <v-card-text>
          Are you sure you want to delete this entry?
          <div class="mt-2 text-body-2">
            Date: {{ pendingDeleteDate }}<br />
            Time: {{ pendingDeleteTime }}<br />
            Weight: {{ pendingDelete?.weight_kg }} kg
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeDeleteDialog"> Cancel </v-btn>
          <v-btn color="error" variant="flat" @click="confirmDelete"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getCurrentLocalDateTime, localToUtc, formatLocalDateTime } from '../api.js'
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

const pendingDelete = ref<Entry | null>(null)
let pendingUpdatedAtSnapshot = ''

const sortedEntries = computed(() => {
  return props.entries
    .map((entry) => ({ entry, ts: Date.parse(entry.timestamp) }))
    .sort((a, b) => b.ts - a.ts)
    .map(({ entry }) => entry)
})

const pendingDeleteDate = computed(() =>
  pendingDelete.value !== null ? formatLocalDateTime(pendingDelete.value.timestamp).date : ''
)

const pendingDeleteTime = computed(() =>
  pendingDelete.value !== null ? formatLocalDateTime(pendingDelete.value.timestamp).time : ''
)

watch(
  () => props.entries,
  () => {
    const pending = pendingDelete.value
    if (pending === null) return
    const live = props.entries.find((entry) => entry.id === pending.id)
    if (live === undefined || live.updated_at !== pendingUpdatedAtSnapshot) {
      pendingDelete.value = null
    }
  }
)

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

function openDeleteDialog(id: number): void {
  const entry = props.entries.find((e) => e.id === id)
  if (entry === undefined) return
  pendingDelete.value = entry
  pendingUpdatedAtSnapshot = entry.updated_at
}

function onDialogModelUpdate(open: boolean): void {
  if (!open) closeDeleteDialog()
}

function closeDeleteDialog(): void {
  pendingDelete.value = null
}

function confirmDelete(): void {
  const pending = pendingDelete.value
  if (pending === null) return
  const id = pending.id
  pendingDelete.value = null
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
