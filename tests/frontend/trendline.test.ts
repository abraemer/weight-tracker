import { describe, it, expect, vi } from 'vitest'
import {
  calculateTrendline,
  getTrendlinePoints,
  DAY_MS,
  THIRTY_DAYS_MS,
} from '../../src/frontend/utils/trendline.js'
import type { Entry } from '../../src/frontend/types/index.js'

function makeEntry(daysAgo: number, weight_kg: number, id: number): Entry {
  return {
    id,
    user_id: 1,
    timestamp: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
    weight_kg,
    created_at: new Date().toISOString(),
  }
}

describe('trendline utilities', () => {
  describe('calculateTrendline', () => {
    it('returns exact slope and intercept for perfectly linear data', () => {
      const entries = [
        makeEntry(0, 70.0, 1),
        makeEntry(1, 70.1, 2),
        makeEntry(2, 70.2, 3),
      ]

      const result = calculateTrendline(entries)
      expect(result).not.toBeNull()

      const { slope, intercept } = result as { slope: number; intercept: number }
      expect(Math.abs(slope) * DAY_MS).toBeCloseTo(0.1, 6)
      for (const entry of entries) {
        const x = new Date(entry.timestamp).getTime()
        expect(slope * x + intercept).toBeCloseTo(entry.weight_kg, 6)
      }
    })

    it('returns null for fewer than 2 entries', () => {
      expect(calculateTrendline([])).toBeNull()
      expect(calculateTrendline([makeEntry(0, 70.0, 1)])).toBeNull()
    })

    it('returns null when only 1 entry is within the 30-day window', () => {
      const entries = [
        makeEntry(0, 70.0, 1),
        makeEntry(40, 71.0, 2),
        makeEntry(50, 71.5, 3),
      ]

      expect(calculateTrendline(entries)).toBeNull()
    })

    it('includes entries exactly at the 30-day boundary', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
      try {
        const entries = [makeEntry(0, 70.0, 1), makeEntry(30, 70.2, 2)]

        expect(calculateTrendline(entries)).not.toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('getTrendlinePoints', () => {
    it('returns two points on the line, straddling now by plus/minus 30 days', () => {
      const trendline = { slope: 0.1 / DAY_MS, intercept: 70.0 }
      const before = Date.now()

      const points = getTrendlinePoints(trendline)

      expect(points).toHaveLength(2)
      const xs = points.map((p) => p.x)
      expect(Math.abs(Math.min(...xs) - (before - THIRTY_DAYS_MS))).toBeLessThanOrEqual(2000)
      expect(Math.abs(Math.max(...xs) - (before + THIRTY_DAYS_MS))).toBeLessThanOrEqual(2000)
      for (const point of points) {
        expect(point.y).toBeCloseTo(trendline.slope * point.x + trendline.intercept, 6)
      }
    })
  })

  describe('time constants', () => {
    it('defines the expected millisecond constants', () => {
      expect(DAY_MS).toBe(24 * 60 * 60 * 1000)
      expect(THIRTY_DAYS_MS).toBe(30 * DAY_MS)
    })
  })
})
