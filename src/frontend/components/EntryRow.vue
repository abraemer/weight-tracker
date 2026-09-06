<template>
  <tr :class="{ 'editing-row': isEditing }">
    <td v-if="!isEditing">{{ formattedDate }}</td>
    <td v-if="!isEditing">{{ formattedTime }}</td>
    <td v-if="!isEditing">{{ entry.weight_kg }}</td>
    <td v-if="isEditing">
      <v-text-field
        v-model="editDate"
        type="date"
        density="compact"
        variant="outlined"
        hide-details
        :error="validationErrors.date"
      />
    </td>
    <td v-if="isEditing">
      <v-text-field
        v-model="editTime"
        type="time"
        density="compact"
        variant="outlined"
        hide-details
        :error="validationErrors.time"
      />
    </td>
    <td v-if="isEditing">
      <v-text-field
        v-model.number="editWeight"
        type="number"
        density="compact"
        variant="outlined"
        hide-details
        step="0.1"
        :error="validationErrors.weight"
      />
    </td>
    <td class="text-right" style="white-space: nowrap">
      <template v-if="!isEditing">
        <v-btn
          icon
          size="small"
          variant="text"
          :disabled="savingEdit || savingDelete"
          :loading="savingEdit"
          @click="startEdit"
        >
          <v-icon>mdi-pencil</v-icon>
        </v-btn>
        <v-btn
          icon
          size="small"
          variant="text"
          color="error"
          :disabled="savingEdit || savingDelete"
          :loading="savingDelete"
          @click="showDeleteDialog = true"
        >
          <v-icon>mdi-delete</v-icon>
        </v-btn>
      </template>
      <template v-else>
        <v-btn
          icon
          size="small"
          variant="text"
          color="primary"
          :disabled="!isValid"
          @click="saveEdit"
        >
          <v-icon>mdi-check</v-icon>
        </v-btn>
        <v-btn icon size="small" variant="text" @click="cancelEdit">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </template>
    </td>
  </tr>

  <v-dialog v-model="showDeleteDialog" max-width="400">
    <v-card>
      <v-card-title>Delete Entry</v-card-title>
      <v-card-text>
        Are you sure you want to delete this entry?
        <div class="mt-2 text-body-2">
          Date: {{ formattedDate }}<br />
          Time: {{ formattedTime }}<br />
          Weight: {{ entry.weight_kg }} kg
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="savingEdit || savingDelete" @click="showDeleteDialog = false">
          Cancel
        </v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="savingDelete"
          :disabled="savingEdit"
          @click="confirmDelete"
        >
          Delete
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatLocalDateTime, localToUtc, utcToLocal } from '../api.js'
import type { Entry, UpdateEntry } from '../types/index.js'

const props = defineProps<{
  entry: Entry
  savingEdit?: boolean
  savingDelete?: boolean
}>()

const emit = defineEmits<{
  update: [id: number, data: UpdateEntry]
  delete: [id: number]
}>()

const isEditing = ref(false)
const editDate = ref('')
const editTime = ref('')
const editWeight = ref(0)
const showDeleteDialog = ref(false)

const formattedDate = computed(() => formatLocalDateTime(props.entry.timestamp).date)
const formattedTime = computed(() => formatLocalDateTime(props.entry.timestamp).time)

const validationErrors = computed(() => ({
  date: isEditing.value && !editDate.value,
  time: isEditing.value && !editTime.value,
  weight: isEditing.value && editWeight.value <= 0,
}))

const isValid = computed(() => {
  return editDate.value && editTime.value && editWeight.value > 0
})

function startEdit(): void {
  const local = utcToLocal(props.entry.timestamp)
  const parts = local.split('T')
  editDate.value = parts[0] ?? ''
  editTime.value = parts[1] ?? ''
  editWeight.value = props.entry.weight_kg
  isEditing.value = true
}

function cancelEdit(): void {
  isEditing.value = false
}

function saveEdit(): void {
  if (!isValid.value) return
  const localDateTime = `${editDate.value}T${editTime.value}`
  const utcTimestamp = localToUtc(localDateTime)
  emit('update', props.entry.id, {
    timestamp: utcTimestamp,
    weight_kg: editWeight.value,
  })
  isEditing.value = false
}

function confirmDelete(): void {
  showDeleteDialog.value = false
  emit('delete', props.entry.id)
}
</script>

<style scoped>
.editing-row {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.editing-row :deep(.v-field) {
  background-color: rgb(var(--v-theme-surface));
}
</style>
