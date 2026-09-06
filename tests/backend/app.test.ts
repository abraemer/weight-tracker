import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { setupTestApp, teardownTestDb } from './test-helper.js'

describe('App', () => {
  let app: express.Application

  beforeEach(async () => {
    const setup = await setupTestApp()
    app = setup.app
  })

  afterEach(() => {
    teardownTestDb()
  })

  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const res = await request(app).get('/api/health')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: 'ok' })
    })
  })

  describe('unknown /api routes', () => {
    it('returns 404 JSON for unknown /api path', async () => {
      const res = await request(app).get('/api/nope')
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Not found' })
    })
  })
})
