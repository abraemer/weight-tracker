<template>
  <v-card>
    <v-card-title>Weight Chart</v-card-title>
    <v-card-text>
      <div v-if="entries.length === 0" class="text-center text-medium-emphasis py-8">
        <v-icon size="64" color="grey-lighten-1">mdi-chart-line</v-icon>
        <p class="mt-4">No data to display</p>
      </div>
      <template v-else>
        <v-checkbox
          v-if="hasTrend"
          v-model="showTrendline"
          label="Show trendline"
          density="compact"
          hide-details
          class="mb-2"
        />
        <div class="chart-container">
          <Line :data="chartData" :options="chartOptions" />
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import zoomPlugin from 'chartjs-plugin-zoom'
import type { Entry } from '../types/index.js'
import {
  calculateTrend,
  DAY_MS,
  THIRTY_DAYS_MS,
} from '../utils/trend.js'

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
  zoomPlugin
)

const props = defineProps<{
  entries: Entry[]
}>()

const sortedEntries = computed(() => {
  return [...props.entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
})

const trend = computed(() => calculateTrend(props.entries))

const hasTrend = computed(() => trend.value !== null)

const showTrendline = ref(true)

const chartData = computed(() => {
  const dataPoints = sortedEntries.value.map((e) => ({
    x: new Date(e.timestamp).getTime(),
    y: e.weight_kg,
  }))

  const datasets: Array<{
    label: string
    data: Array<{ x: number; y: number }>
    borderColor: string
    backgroundColor: string
    tension: number
    fill: boolean
    pointRadius: number
    borderDash?: number[]
  }> = [
    {
      label: 'Weight (kg)',
      data: dataPoints,
      borderColor: 'rgb(25, 118, 210)',
      backgroundColor: 'rgba(25, 118, 210, 0.1)',
      tension: 0.1,
      fill: true,
      pointRadius: 4,
    },
  ]

  if (trend.value && showTrendline.value) {
    datasets.push({
      label: `Trend (${Math.round(trend.value.slopeKgPerDay * 1000 * 30)} g/30d)`,
      data: trend.value.points,
      borderColor: 'rgb(211, 47, 47)',
      backgroundColor: 'transparent',
      tension: 0,
      fill: false,
      pointRadius: 0,
    })
    datasets.push({
      label: 'Forecast (30d)',
      data: trend.value.forecast,
      borderColor: 'rgb(211, 47, 47)',
      backgroundColor: 'transparent',
      borderDash: [5, 5],
      tension: 0,
      fill: false,
      pointRadius: 0,
    })
  }

  return { datasets }
})

const xAxisRange = computed(() => {
  const now = new Date()
  const oneYearAgo = new Date(now.getTime() - 365 * DAY_MS)

  if (sortedEntries.value.length === 0) {
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS)
    return { min: thirtyDaysAgo.getTime(), max: now.getTime() }
  }

  const timestamps = sortedEntries.value.map((e) => new Date(e.timestamp).getTime())
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const range = maxTime - minTime
  const padding = range > 0 ? range * 0.1 : 7 * DAY_MS

  const minWithPadding = minTime - padding
  const min = Math.max(oneYearAgo.getTime(), minWithPadding)

  return { min, max: maxTime + Math.max(padding, 35 * DAY_MS) }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    intersect: false,
    mode: 'index' as const,
  },
  scales: {
    x: {
      type: 'time' as const,
      display: true,
      title: {
        display: false,
      },
      min: xAxisRange.value.min,
      max: xAxisRange.value.max,
    },
    y: {
      display: true,
      title: {
        display: true,
        text: 'Weight (kg)',
      },
    },
  },
  plugins: {
    legend: {
      display: true,
      position: 'top' as const,
    },
    tooltip: {
      enabled: true,
    },
    zoom: {
      pan: {
        enabled: true,
        mode: 'xy' as const,
      },
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true,
        },
        mode: 'xy' as const,
      },
    },
  },
}))
</script>

<style scoped>
.chart-container {
  position: relative;
  height: 400px;
  width: 100%;
}
</style>
