<template>
  <div class="user-view">
    <div v-if="loading" class="d-flex justify-center my-4">
      <v-progress-circular indeterminate />
    </div>
    <div v-else class="user-view__content">
      <div class="user-view__table">
        <WeightTable
          :entries="entries"
          :saving="isSaving"
          @create="handleCreate"
          @update="handleUpdate"
          @delete="handleDelete"
        />
      </div>
      <div class="user-view__chart">
        <WeightChart :entries="entries" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, computed } from 'vue'
import { useEntries } from '../composables/useEntries.js'
import WeightChart from './WeightChart.vue'
import WeightTable from './WeightTable.vue'
import type { NewEntry, UpdateEntry } from '../types/index.js'

const props = defineProps<{
  userId: number
}>()

const { entries, loading, loadEntries, addEntry, editEntry, removeEntry, isOperationLoading } =
  useEntries(props.userId)

const isSaving = computed(() => {
  return isOperationLoading(`add-${props.userId}`)
})

watch(
  () => props.userId,
  (newUserId) => loadEntries(newUserId),
  { immediate: true }
)

async function handleCreate(data: NewEntry): Promise<void> {
  await addEntry(data, props.userId)
}

async function handleUpdate(id: number, data: UpdateEntry): Promise<void> {
  await editEntry(id, data, props.userId)
}

async function handleDelete(id: number): Promise<void> {
  await removeEntry(id, props.userId)
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
