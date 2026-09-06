import { describe, it, expect } from 'vitest'
import { parseId } from '../../../src/backend/utils/parse-id.js'

describe('parseId', () => {
  it('parses valid integer strings', () => {
    expect(parseId('12')).toBe(12)
    expect(parseId('-1')).toBe(-1)
  })

  it('rejects non-integer and unsafe inputs', () => {
    expect(parseId('abc')).toBeNull()
    expect(parseId('12.9')).toBeNull()
    expect(parseId('')).toBeNull()
    expect(parseId('0x10')).toBeNull()
    expect(parseId('1e2')).toBeNull()
    expect(parseId(' 12 ')).toBeNull()
    expect(parseId('99999999999999999999')).toBeNull()
  })
})
