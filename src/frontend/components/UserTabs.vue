<template>
  <v-tabs v-model="internalTab" bg-color="primary" show-arrows class="user-tabs">
    <v-tab v-for="user in users" :key="user.id" :value="user.id">
      {{ user.name }}
    </v-tab>
    <v-tab value="add" @click.stop="$emit('add-user')">
      <v-icon>mdi-plus</v-icon>
    </v-tab>
  </v-tabs>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { User } from '../types/index.js'

const props = defineProps<{
  users: User[]
  modelValue: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'add-user': []
}>()

const internalTab = ref<number | 'add' | null>(props.modelValue)

watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal !== null) {
      internalTab.value = newVal
    }
  }
)

watch(internalTab, (newVal) => {
  if (newVal !== 'add' && newVal !== null) {
    emit('update:modelValue', newVal)
  }
})
</script>

<style scoped>
.user-tabs {
  max-width: 100%;
}
</style>
