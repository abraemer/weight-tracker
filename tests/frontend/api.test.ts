import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  localToUtc,
  utcToLocal,
  formatLocalDateTime,
  getCurrentLocalDateTime,
  updateEntry,
  deleteEntry,
  setErrorHandler,
} from '../../src/frontend/api.js'
import type { Entry } from '../../src/frontend/types/index.js'

const row: Entry = {
  id: 5,
  user_id: 1,
  timestamp: '2024-01-15T10:00:00.000Z',
  weight_kg: 70.5,
  created_at: '2024-01-15T10:00:00.000Z',
  updated_at: '2024-01-16T10:00:00.000Z',
  deleted: false,
}

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

  describe('updateEntry conflict handling', () => {
    let showError: ReturnType<typeof vi.fn>
    const fetchMock = vi.fn()

    beforeEach(() => {
      showError = vi.fn()
      setErrorHandler(showError)
      fetchMock.mockReset()
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      setErrorHandler(vi.fn())
    })

    it('returns ok with the server row on success and sends updated_at in the body', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify(row), { status: 200 }))

      const result = await updateEntry(5, { weight_kg: 71 }, '2024-01-15T10:00:00.000Z')

      expect(result).toEqual({ kind: 'ok', entry: row })
      expect(showError).not.toHaveBeenCalled()
      const init = fetchMock.mock.calls[0]![1] as RequestInit
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body as string)).toEqual({
        weight_kg: 71,
        updated_at: '2024-01-15T10:00:00.000Z',
      })
    })

    it('returns conflict without invoking the error handler on a well-formed 409', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: 'conflict', row }), { status: 409 })
      )

      const result = await updateEntry(5, { weight_kg: 71 }, '2024-01-01T00:00:00.000Z')

      expect(result).toEqual({ kind: 'conflict', entry: row })
      expect(showError).not.toHaveBeenCalled()
    })

    it('returns gone without invoking the error handler on 404', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Entry not found' }), { status: 404 })
      )

      const result = await updateEntry(5, { weight_kg: 71 }, '2024-01-01T00:00:00.000Z')

      expect(result).toEqual({ kind: 'gone' })
      expect(showError).not.toHaveBeenCalled()
    })

    it('falls back to the error path when the 409 body misses the row', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: 'conflict' }), { status: 409 })
      )

      await expect(updateEntry(5, { weight_kg: 71 }, '2024-01-01T00:00:00.000Z')).rejects.toThrow(
        'conflict'
      )
      expect(showError).toHaveBeenCalledWith('conflict')
    })

    it('falls back to the error path when the 409 body is not JSON', async () => {
      fetchMock.mockResolvedValue(new Response('not json', { status: 409 }))

      await expect(updateEntry(5, { weight_kg: 71 }, '2024-01-01T00:00:00.000Z')).rejects.toThrow(
        'Request failed with status 409'
      )
      expect(showError).toHaveBeenCalledWith('Request failed with status 409')
    })

    it('falls back to the error path when the 409 row does not match the Entry shape', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: 'conflict', row: { id: 'bogus' } }), { status: 409 })
      )

      await expect(updateEntry(5, { weight_kg: 71 }, '2024-01-01T00:00:00.000Z')).rejects.toThrow()
      expect(showError).toHaveBeenCalled()
    })

    it('still throws on network failure without invoking the error handler', async () => {
      fetchMock.mockRejectedValue(new Error('offline'))

      await expect(updateEntry(5, { weight_kg: 71 }, '2024-01-01T00:00:00.000Z')).rejects.toThrow(
        'offline'
      )
      expect(showError).not.toHaveBeenCalled()
    })

    it('shows the snackbar for other non-ok statuses', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: 'bad request' }), { status: 400 })
      )

      await expect(updateEntry(5, { weight_kg: 71 }, '2024-01-01T00:00:00.000Z')).rejects.toThrow(
        'bad request'
      )
      expect(showError).toHaveBeenCalledWith('bad request')
    })
  })

  describe('deleteEntry conflict handling', () => {
    let showError: ReturnType<typeof vi.fn>
    const fetchMock = vi.fn()

    beforeEach(() => {
      showError = vi.fn()
      setErrorHandler(showError)
      fetchMock.mockReset()
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      setErrorHandler(vi.fn())
    })

    it('returns ok on 204 and sends the observed version URL-encoded as query param', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

      const result = await deleteEntry(7, '2024-01-15T10:00:00.000Z')

      expect(result).toEqual({ kind: 'ok' })
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/entries/7?updated_at=2024-01-15T10%3A00%3A00.000Z',
        expect.objectContaining({ method: 'DELETE' })
      )
      expect(showError).not.toHaveBeenCalled()
    })

    it('returns conflict without invoking the error handler on a well-formed 409', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: 'conflict', row }), { status: 409 })
      )

      const result = await deleteEntry(7, '2024-01-01T00:00:00.000Z')

      expect(result).toEqual({ kind: 'conflict', entry: row })
      expect(showError).not.toHaveBeenCalled()
    })

    it('returns gone without invoking the error handler on 404', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Entry not found' }), { status: 404 })
      )

      const result = await deleteEntry(7)

      expect(result).toEqual({ kind: 'gone' })
      expect(showError).not.toHaveBeenCalled()
    })

    it('falls back to the error path when the 409 body is malformed', async () => {
      fetchMock.mockResolvedValue(new Response('gateway garbage', { status: 409 }))

      await expect(deleteEntry(7, '2024-01-01T00:00:00.000Z')).rejects.toThrow(
        'Request failed with status 409'
      )
      expect(showError).toHaveBeenCalledWith('Request failed with status 409')
    })

    it('still throws on network failure without invoking the error handler', async () => {
      fetchMock.mockRejectedValue(new Error('offline'))

      await expect(deleteEntry(7, '2024-01-01T00:00:00.000Z')).rejects.toThrow('offline')
      expect(showError).not.toHaveBeenCalled()
    })
  })
})
