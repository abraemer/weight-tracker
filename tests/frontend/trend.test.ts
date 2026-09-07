import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { calculateTrend, DAY_MS } from '../../src/frontend/utils/trend.js'
import type { TrendPoint, TrendResult } from '../../src/frontend/utils/trend.js'
import type { Entry } from '../../src/frontend/types/index.js'

const NOW = new Date('2026-06-01T12:00:00.000Z')

function makeEntry(daysAgo: number, weight_kg: number, id: number): Entry {
  return {
    id,
    user_id: 1,
    timestamp: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
    weight_kg,
    created_at: new Date().toISOString(),
  }
}

function calculateTrendOrThrow(entries: Entry[]): TrendResult {
  const result = calculateTrend(entries)
  if (result === null) throw new Error('calculateTrend returned null')
  return result
}

function pointAt(points: TrendPoint[], index: number): TrendPoint {
  const point = points[index]
  if (point === undefined) throw new Error(`missing point at index ${index}`)
  return point
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussianNoise(seed: number, standardDeviation: number): () => number {
  const rand = mulberry32(seed)
  let cached: number | null = null
  return () => {
    if (cached !== null) {
      const value = cached
      cached = null
      return value
    }
    const u1 = Math.max(rand(), Number.EPSILON)
    const u2 = rand()
    const radius = Math.sqrt(-2 * Math.log(u1))
    cached = radius * Math.sin(2 * Math.PI * u2) * standardDeviation
    return radius * Math.cos(2 * Math.PI * u2) * standardDeviation
  }
}

const MEASUREMENT_NOISE_STD_DEV = 0.5

function noisySeries(count: number, seed: number): Entry[] {
  const nextNoise = gaussianNoise(seed, MEASUREMENT_NOISE_STD_DEV)
  const entries: Entry[] = []
  for (let k = 0; k < count; k++) {
    entries.push(makeEntry(count - 1 - k, 70 + 0.02 * k + nextNoise(), k + 1))
  }
  return entries
}

function expectAllFinite(result: TrendResult): void {
  for (const point of [...result.points, ...result.forecast]) {
    expect(Number.isFinite(point.x)).toBe(true)
    expect(Number.isFinite(point.y)).toBe(true)
  }
  expect(Number.isFinite(result.slopeKgPerDay)).toBe(true)
}

describe('trend (Kalman filter)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for empty and single-entry input', () => {
    expect(calculateTrend([])).toBeNull()
    expect(calculateTrend([makeEntry(0, 70, 1)])).toBeNull()
  })

  it('reproduces a noise-free linear series exactly', () => {
    const entries: Entry[] = []
    for (let k = 0; k < 30; k++) {
      entries.push(makeEntry(29 - k, 70 + 0.1 * k, k + 1))
    }

    const result = calculateTrendOrThrow(entries)

    expect(result.points).toHaveLength(30)
    for (let k = 0; k < 30; k++) {
      expect(Math.abs(pointAt(result.points, k).y - (70 + 0.1 * k))).toBeLessThan(1e-6)
    }
    expect(Math.abs(result.slopeKgPerDay - 0.1)).toBeLessThan(1e-6)
    expect(result.forecast).toHaveLength(31)
    const lastPoint = pointAt(result.points, 29)
    expect(pointAt(result.forecast, 0).y).toBe(lastPoint.y)
    const lastEntry = entries.at(-1)
    if (lastEntry === undefined) throw new Error('entries empty')
    const lastEntryMs = new Date(lastEntry.timestamp).getTime()
    expect(pointAt(result.forecast, 30).x).toBe(lastEntryMs + 30 * DAY_MS)
    expect(Math.abs(pointAt(result.forecast, 30).y - (70 + 0.1 * 59))).toBeLessThan(1e-6)
  })

  it('derives an exact slope from the first pair of two entries', () => {
    const entries = [makeEntry(1, 70, 1), makeEntry(0, 70.1, 2)]

    const result = calculateTrendOrThrow(entries)

    expect(Math.abs(result.slopeKgPerDay - 0.1)).toBeLessThan(1e-9)
    expect(Math.abs(pointAt(result.forecast, 30).y - (70.1 + 3.0))).toBeLessThan(1e-9)
  })

  it('returns finite flat output for duplicate timestamps', () => {
    const entries = [makeEntry(0, 70, 1), makeEntry(0, 70.5, 2)]

    const result = calculateTrendOrThrow(entries)

    expect(result.slopeKgPerDay).toBe(0)
    expectAllFinite(result)
    const firstForecastY = pointAt(result.forecast, 0).y
    for (const point of result.forecast) {
      expect(point.y).toBe(firstForecastY)
    }
  })

  it('stays finite with an extra same-day entry in a daily series', () => {
    const entries: Entry[] = []
    for (let k = 0; k < 10; k++) {
      entries.push(makeEntry(9 - k, 70 + 0.1 * k, k + 1))
    }
    entries.push(makeEntry(3.5, 70.55, 11))

    const result = calculateTrendOrThrow(entries)

    expectAllFinite(result)
  })

  it('tracks a noisy series within tolerance', () => {
    const entries = noisySeries(90, 42)

    const result = calculateTrendOrThrow(entries)

    expectAllFinite(result)
    const lastPoint = result.points.at(-1)
    if (lastPoint === undefined) throw new Error('points empty')
    const finalLevel = lastPoint.y
    expect(finalLevel).toBe(pointAt(result.forecast, 0).y)
    expect(Math.abs(finalLevel - (70 + 0.02 * 89))).toBeLessThanOrEqual(1.81)
    expect(Math.abs(result.slopeKgPerDay - 0.02)).toBeLessThanOrEqual(0.0554)
  })

  it('bridges a 20-day gap within tolerance', () => {
    const nextNoise = gaussianNoise(42, MEASUREMENT_NOISE_STD_DEV)
    const dayIndices: number[] = []
    for (let d = 0; d < 20; d++) dayIndices.push(d)
    for (let d = 40; d < 60; d++) dayIndices.push(d)
    const entries = dayIndices.map((d, i) => makeEntry(59 - d, 70 + 0.02 * d + nextNoise(), i + 1))

    const result = calculateTrendOrThrow(entries)

    expect(result.points).toHaveLength(40)
    expectAllFinite(result)
    const lastPoint = result.points.at(-1)
    if (lastPoint === undefined) throw new Error('points empty')
    expect(Math.abs(lastPoint.y - (70 + 0.02 * 59))).toBeLessThanOrEqual(1.81)
    expect(Math.abs(result.slopeKgPerDay - 0.02)).toBeLessThanOrEqual(0.0554)
  })

  it('is invariant to input order', () => {
    const entries = noisySeries(90, 42)
    const rand = mulberry32(7)
    const shuffled = [...entries]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const left = shuffled[i]
      const right = shuffled[j]
      if (left !== undefined && right !== undefined) {
        shuffled[i] = right
        shuffled[j] = left
      }
    }
    expect(shuffled).not.toEqual(entries)

    const sortedResult = calculateTrendOrThrow(entries)
    const shuffledResult = calculateTrendOrThrow(shuffled)

    expect(JSON.stringify(shuffledResult)).toBe(JSON.stringify(sortedResult))
  })

  it('is deterministic across runs', () => {
    const entries = noisySeries(90, 42)

    const first = calculateTrendOrThrow(entries)
    const second = calculateTrendOrThrow(entries)

    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
