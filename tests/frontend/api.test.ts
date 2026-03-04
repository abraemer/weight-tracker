import { describe, it, expect } from 'vitest'
import {
  localToUtc,
  utcToLocal,
  formatLocalDateTime,
  getCurrentLocalDateTime,
} from '../../src/frontend/api.js'

describe('api utilities', () => {
  describe('localToUtc', () => {
    it('converts local datetime string to UTC ISO string', () => {
      const result = localToUtc('2024-01-15T10:30')
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('handles different dates', () => {
      const result = localToUtc('2024-12-25T00:00')
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })
  })

  describe('utcToLocal', () => {
    it('converts UTC timestamp to local datetime string', () => {
      const utc = '2024-01-15T10:30:00.000Z'
      const result = utcToLocal(utc)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })

    it('pads single digit values', () => {
      const utc = '2024-01-05T05:05:00.000Z'
      const result = utcToLocal(utc)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })
  })

  describe('formatLocalDateTime', () => {
    it('formats UTC timestamp into date and time parts', () => {
      const utc = '2024-01-15T14:30:00.000Z'
      const result = formatLocalDateTime(utc)
      expect(result).toHaveProperty('date')
      expect(result).toHaveProperty('time')
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(result.time).toMatch(/^\d{2}:\d{2}$/)
    })
  })

  describe('getCurrentLocalDateTime', () => {
    it('returns current datetime in local format', () => {
      const result = getCurrentLocalDateTime()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })

    it('returns string with correct format', () => {
      const result = getCurrentLocalDateTime()
      const parts = result.split('T')
      expect(parts).toHaveLength(2)
      expect(parts[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(parts[1]).toMatch(/^\d{2}:\d{2}$/)
    })
  })
})
