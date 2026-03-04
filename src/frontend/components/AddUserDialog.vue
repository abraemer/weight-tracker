<template>
  <v-dialog
    :model-value="modelValue"
    max-width="400"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>Add User</v-card-title>
      <v-card-text>
        <v-form ref="form" @submit.prevent="handleSubmit">
          <v-text-field
            v-model="name"
            label="Name"
            :error-messages="error"
            :disabled="saving"
            autofocus
            @update:model-value="error = ''"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="saving" @click="handleCancel"> Cancel </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!name.trim() || saving"
          :loading="saving"
          @click="handleSubmit"
        >
          Create
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  create: [name: string]
}>()

const name = ref('')
const error = ref('')
const saving = ref(false)

function handleSubmit(): void {
  const trimmedName = name.value.trim()
  if (!trimmedName) {
    error.value = 'Name is required'
    return
  }
  saving.value = true
  emit('create', trimmedName)
  saving.value = false
  name.value = ''
  error.value = ''
}

function handleCancel(): void {
  name.value = ''
  error.value = ''
  emit('update:modelValue', false)
}
</script>
