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
          v-if="hasSufficientDataForTrendline"
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
  CategoryScale,
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

ChartJS.register(
  CategoryScale,
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

interface TrendlineData {
  slope: number
  intercept: number
  startDate: Date
  endDate: Date
}

function calculateTrendline(entries: Entry[]): TrendlineData | null {
  if (entries.length < 2) return null

  const timestamps = entries.map((e) => new Date(e.timestamp).getTime())
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const daysDiff = (maxTime - minTime) / (24 * 60 * 60 * 1000)

  if (daysDiff < 30) {
    return null
  }

  const points = entries.map((e) => ({
    x: new Date(e.timestamp).getTime(),
    y: e.weight_kg,
  }))

  const n = points.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0

  for (const point of points) {
    sumX += point.x
    sumY += point.y
    sumXY += point.x * point.y
    sumXX += point.x * point.x
  }

  const slopeKgPerMs = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slopeKgPerMs * sumX) / n

  const startDate = new Date(minTime)
  const endDate = new Date(maxTime + 30 * 24 * 60 * 60 * 1000)

  return {
    slope: slopeKgPerMs,
    intercept,
    startDate,
    endDate,
  }
}

function getTrendlinePoints(trendline: TrendlineData): { x: number; y: number }[] {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const startX = thirtyDaysAgo.getTime()
  const endX = thirtyDaysFromNow.getTime()

  return [
    { x: startX, y: trendline.slope * startX + trendline.intercept },
    { x: endX, y: trendline.slope * endX + trendline.intercept },
  ]
}

const sortedEntries = computed(() => {
  return [...props.entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
})

const trendline = computed(() => calculateTrendline(props.entries))

const hasSufficientDataForTrendline = computed(() => trendline.value !== null)

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

  if (trendline.value && showTrendline.value) {
    const trendPoints = getTrendlinePoints(trendline.value)
    const msPer30Days = 30 * 24 * 60 * 60 * 1000
    const slopeGPer30Days = Math.round(trendline.value.slope * 1000 * msPer30Days)
    datasets.push({
      label: `Trend (${slopeGPer30Days} g/30d)`,
      data: trendPoints,
      borderColor: 'rgb(211, 47, 47)',
      backgroundColor: 'transparent',
      tension: 0,
      fill: false,
      pointRadius: 0,
      borderDash: [5, 5],
    })
  }

  return { datasets }
})

const xAxisRange = computed(() => {
  const now = new Date()
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

  if (sortedEntries.value.length === 0) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return { min: thirtyDaysAgo.getTime(), max: now.getTime() }
  }

  const timestamps = sortedEntries.value.map((e) => new Date(e.timestamp).getTime())
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const range = maxTime - minTime
  const padding = range > 0 ? range * 0.1 : 7 * 24 * 60 * 60 * 1000

  const minWithPadding = minTime - padding
  const min = Math.max(oneYearAgo.getTime(), minWithPadding)

  return { min, max: maxTime + padding }
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
