import type { Entry } from '../types/index.js'

export const DAY_MS = 24 * 60 * 60 * 1000

export const THIRTY_DAYS_MS = 30 * DAY_MS

export interface TrendPoint {
  x: number
  y: number
}

export interface TrendResult {
  points: TrendPoint[]
  forecast: TrendPoint[]
  slopeKgPerDay: number
}

const MEASUREMENT_NOISE_VARIANCE = 0.25
const LEVEL_PROCESS_VARIANCE = 0.005
const SLOPE_PROCESS_VARIANCE = 1e-5
const INITIAL_LEVEL_VARIANCE = 25
const INITIAL_SLOPE_VARIANCE = 0.5

export function calculateTrend(entries: Entry[]): TrendResult | null {
  if (entries.length < 2) return null

  const sorted = [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )

  const firstEntry = sorted.at(0)
  const secondEntry = sorted.at(1)
  if (firstEntry === undefined || secondEntry === undefined) return null

  const firstTime = new Date(firstEntry.timestamp).getTime()
  let level = firstEntry.weight_kg
  const initialDtDays =
    (new Date(secondEntry.timestamp).getTime() - firstTime) / DAY_MS
  let slope = initialDtDays > 0 ? (secondEntry.weight_kg - firstEntry.weight_kg) / initialDtDays : 0
  let p00 = INITIAL_LEVEL_VARIANCE
  let p01 = 0
  let p11 = INITIAL_SLOPE_VARIANCE

  const points: TrendPoint[] = [{ x: firstTime, y: level }]
  let previousTime = firstTime

  for (const entry of sorted.slice(1)) {
    const time = new Date(entry.timestamp).getTime()
    const dt = (time - previousTime) / DAY_MS

    level += slope * dt
    p00 += 2 * dt * p01 + dt * dt * p11 + LEVEL_PROCESS_VARIANCE * dt
    p01 += dt * p11
    p11 += SLOPE_PROCESS_VARIANCE * dt

    const innovation = entry.weight_kg - level
    const innovationVariance = p00 + MEASUREMENT_NOISE_VARIANCE
    const gain0 = p00 / innovationVariance
    const gain1 = p01 / innovationVariance
    level += gain0 * innovation
    slope += gain1 * innovation
    p11 -= gain1 * p01
    p01 *= 1 - gain0
    p00 *= 1 - gain0

    points.push({ x: time, y: level })
    previousTime = time
  }

  const forecast: TrendPoint[] = []
  for (let k = 0; k <= 30; k++) {
    forecast.push({ x: previousTime + k * DAY_MS, y: level + slope * k })
  }

  return { points, forecast, slopeKgPerDay: slope }
}
