<template>
  <div class="user-view">
    <div class="user-view__content">
      <div class="user-view__table">
        <WeightTable
          :entries="entries"
          @create="handleCreate"
          @update="handleUpdate"
          @delete="handleDelete"
        />
      </div>
      <div class="user-view__chart">
        <v-card>
          <v-card-title>Weight Chart</v-card-title>
          <v-card-text class="text-center text-medium-emphasis py-8">
            <v-icon size="64" color="grey-lighten-1">mdi-chart-line</v-icon>
            <p class="mt-4">Chart coming in Phase 6</p>
          </v-card-text>
        </v-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useEntries } from '../composables/useEntries.js'
import WeightTable from './WeightTable.vue'
import type { NewEntry, UpdateEntry } from '../types/index.js'

const props = defineProps<{
  userId: number
}>()

const { entries, loadEntries, addEntry, editEntry, removeEntry } = useEntries(props.userId)

watch(() => props.userId, loadEntries, { immediate: true })

async function handleCreate(data: NewEntry): Promise<void> {
  await addEntry(data)
}

async function handleUpdate(id: number, data: UpdateEntry): Promise<void> {
  await editEntry(id, data)
}

async function handleDelete(id: number): Promise<void> {
  await removeEntry(id)
}
</script>

<style scoped>
.user-view {
  width: 100%;
}

.user-view__content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 767px) {
  .user-view__content {
    grid-template-columns: 1fr;
  }
}

.user-view__table {
  min-width: 0;
}

.user-view__chart {
  min-width: 0;
}
</style>
