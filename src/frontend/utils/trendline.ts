import type { Entry } from '../types/index.js'

export const DAY_MS = 24 * 60 * 60 * 1000

export const THIRTY_DAYS_MS = 30 * DAY_MS

export interface TrendlineData {
  slope: number
  intercept: number
}

export function calculateTrendline(entries: Entry[]): TrendlineData | null {
  if (entries.length < 2) return null

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS)

  const recentEntries = entries.filter((e) => new Date(e.timestamp) >= thirtyDaysAgo)

  if (recentEntries.length < 2) return null

  const points = recentEntries.map((e) => ({
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

  return {
    slope: slopeKgPerMs,
    intercept,
  }
}

export function getTrendlinePoints(trendline: TrendlineData): { x: number; y: number }[] {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS)
  const thirtyDaysFromNow = new Date(now.getTime() + THIRTY_DAYS_MS)

  const startX = thirtyDaysAgo.getTime()
  const endX = thirtyDaysFromNow.getTime()

  return [
    { x: startX, y: trendline.slope * startX + trendline.intercept },
    { x: endX, y: trendline.slope * endX + trendline.intercept },
  ]
}
