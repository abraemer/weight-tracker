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
        <button
          type="button"
          class="mdi mdi-pencil weight-row-btn"
          :class="{ 'weight-row-btn--busy': savingEdit }"
          :disabled="savingEdit || savingDelete"
          aria-label="Edit entry"
          @click="startEdit"
        ></button>
        <button
          type="button"
          class="mdi mdi-delete weight-row-btn weight-row-btn--danger"
          :class="{ 'weight-row-btn--busy': savingDelete }"
          :disabled="savingEdit || savingDelete"
          aria-label="Delete entry"
          @click="requestDelete"
        ></button>
      </template>
      <template v-else>
        <button
          type="button"
          class="mdi mdi-check weight-row-btn weight-row-btn--confirm"
          :class="{ 'weight-row-btn--busy': savingEdit }"
          :disabled="!isValid"
          aria-label="Save"
          @click="saveEdit"
        ></button>
        <button
          type="button"
          class="mdi mdi-close weight-row-btn"
          aria-label="Cancel"
          @click="cancelEdit"
        ></button>
      </template>
    </td>
  </tr>
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
  'delete-request': [id: number]
  'edit-start': [id: number]
  'edit-end': [id: number]
}>()

const isEditing = ref(false)
const editDate = ref('')
const editTime = ref('')
const editWeight = ref(0)

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
  emit('edit-start', props.entry.id)
  isEditing.value = true
}

function cancelEdit(): void {
  emit('edit-end', props.entry.id)
  isEditing.value = false
}

function saveEdit(): void {
  if (!isValid.value) return
  const localDateTime = `${editDate.value}T${editTime.value}`
  const utcTimestamp = localToUtc(localDateTime)
  emit('edit-end', props.entry.id)
  emit('update', props.entry.id, {
    timestamp: utcTimestamp,
    weight_kg: editWeight.value,
  })
  isEditing.value = false
}

function requestDelete(): void {
  emit('delete-request', props.entry.id)
}
</script>

<style scoped>
.editing-row {
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.editing-row :deep(.v-field) {
  background-color: rgb(var(--v-theme-surface));
}

.weight-row-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 50%;
  padding: 0;
  background-color: transparent;
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.weight-row-btn:hover:not(:disabled) {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
}

.weight-row-btn:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.weight-row-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.weight-row-btn.weight-row-btn--busy {
  cursor: wait;
  opacity: 0.6;
}

.weight-row-btn--confirm {
  color: rgb(var(--v-theme-primary));
}

.weight-row-btn--danger {
  color: rgb(var(--v-theme-error));
}
</style>
