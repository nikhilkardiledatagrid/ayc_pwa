/**
 * sessionManager unit tests
 *
 * Covers:
 *   initSession — creates new session when no localStorage state exists
 *   initSession — resumes existing session when < 30 min old (no API call)
 *   initSession — creates new session when stored session is > 30 min old
 *   createSession — backward-compat shim maps old params to initSession
 *   upgradeSession — calls PUT /pwa/session/upgrade with session_id
 *   endSession — calls sendBeacon with correct URL and JSON blob
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initSession, createSession, upgradeSession, endSession } from '../core/utils/sessionManager'

vi.mock('../core/api/pwaAxios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    put:  vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

// Mock deviceConfig helpers so tests control localStorage state
vi.mock('../core/utils/deviceConfig', () => ({
  getSessionState:   vi.fn(),
  saveSessionState:  vi.fn(),
  clearSessionState: vi.fn(),
  getDeviceConfig:   vi.fn(),
}))

import pwaAxios from '../core/api/pwaAxios'
import { getSessionState, saveSessionState, clearSessionState, getDeviceConfig } from '../core/utils/deviceConfig'

const TEST_API_BASE = 'http://localhost:8000/api/v1'
const TEST_SESSION  = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const setSearch = (search) => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { search },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_API_BASE_URL', TEST_API_BASE)
  setSearch('')
  navigator.sendBeacon = vi.fn()
  // Default: no stored session
  getSessionState.mockReturnValue(null)
  // Default: no device token
  getDeviceConfig.mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ─── initSession ──────────────────────────────────────────────────────────────

describe('initSession', () => {
  it('calls POST /pwa/session/start when no session in localStorage', async () => {
    getSessionState.mockReturnValue(null)

    const sessionId = await initSession({ table_name: 'Table 7', scenario: 'C' })

    expect(pwaAxios.post).toHaveBeenCalledWith(
      '/pwa/session/start',
      expect.objectContaining({ session_id: sessionId, table_name: 'Table 7', scenario: 'C' }),
    )
  })

  it('logs a SESSION_START event when a new session is created', async () => {
    getSessionState.mockReturnValue(null)

    const sessionId = await initSession({ table_name: 'Table 7', scenario: 'C' })

    expect(pwaAxios.post).toHaveBeenCalledWith(
      '/pwa/events',
      expect.objectContaining({ event_type: 'session_start', session_id: sessionId }),
    )
  })

  it('does NOT log a SESSION_START event when an existing session is resumed', async () => {
    const recentStart = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    getSessionState.mockReturnValue({ session_id: TEST_SESSION, started_at: recentStart })

    await initSession({ table_name: 'T1', scenario: 'C' })

    expect(pwaAxios.post).not.toHaveBeenCalled()
  })

  it('returns a valid UUID v4', async () => {
    getSessionState.mockReturnValue(null)

    const sessionId = await initSession({ table_name: 'Table 1', scenario: 'A' })

    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('saves the new session_id and started_at to localStorage', async () => {
    getSessionState.mockReturnValue(null)

    await initSession({ table_name: 'T1', scenario: 'B' })

    expect(saveSessionState).toHaveBeenCalledOnce()
    const saved = saveSessionState.mock.calls[0][0]
    expect(saved).toHaveProperty('session_id')
    expect(saved).toHaveProperty('started_at')
  })

  it('resumes an existing session when < 30 min old — no API call', async () => {
    const recentStart = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 min ago
    getSessionState.mockReturnValue({ session_id: TEST_SESSION, started_at: recentStart })

    const sessionId = await initSession({ table_name: 'T1', scenario: 'C' })

    expect(pwaAxios.post).not.toHaveBeenCalled()
    expect(sessionId).toBe(TEST_SESSION)
  })

  it('creates a new session when stored session is > 30 min old', async () => {
    const oldStart = new Date(Date.now() - 35 * 60 * 1000).toISOString() // 35 min ago
    getSessionState.mockReturnValue({ session_id: TEST_SESSION, started_at: oldStart })

    const newId = await initSession({ table_name: 'T1', scenario: 'C' })

    expect(pwaAxios.post).toHaveBeenCalledWith(
      '/pwa/session/start',
      expect.objectContaining({ session_id: newId }),
    )
    expect(newId).not.toBe(TEST_SESSION)
  })

  it('generates a different UUID on each new call', async () => {
    getSessionState.mockReturnValue(null)

    const a = await initSession({ table_name: 'T1', scenario: 'C' })
    getSessionState.mockReturnValue(null) // no saved state between calls
    const b = await initSession({ table_name: 'T1', scenario: 'C' })

    expect(a).not.toBe(b)
  })
})

// ─── createSession (backward-compat shim) ─────────────────────────────────────

describe('createSession', () => {
  it('accepts old { table, scenario } shape and calls the backend', async () => {
    getSessionState.mockReturnValue(null)

    const sessionId = await createSession({ venue_id: '3', screen_id: '22', table: 'Table 7', scenario: 'A' })

    expect(typeof sessionId).toBe('string')
    expect(pwaAxios.post).toHaveBeenCalledWith(
      '/pwa/session/start',
      expect.objectContaining({ table_name: 'Table 7', scenario: 'A' }),
    )
  })

  it('returns a UUID', async () => {
    getSessionState.mockReturnValue(null)

    const sessionId = await createSession({ table: 'T3', scenario: 'C' })

    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('resumes session when one exists < 30 min old', async () => {
    const recentStart = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    getSessionState.mockReturnValue({ session_id: TEST_SESSION, started_at: recentStart })

    const sessionId = await createSession({ table: 'T1', scenario: 'C' })

    expect(pwaAxios.post).not.toHaveBeenCalled()
    expect(sessionId).toBe(TEST_SESSION)
  })
})

// ─── upgradeSession ───────────────────────────────────────────────────────────

describe('upgradeSession', () => {
  it('calls PUT /pwa/session/upgrade with session_id', async () => {
    await upgradeSession(TEST_SESSION)

    expect(pwaAxios.put).toHaveBeenCalledOnce()
    expect(pwaAxios.put).toHaveBeenCalledWith('/pwa/session/upgrade', { session_id: TEST_SESSION })
  })

  it('uses PUT not POST', async () => {
    await upgradeSession(TEST_SESSION)

    expect(pwaAxios.post).not.toHaveBeenCalled()
    expect(pwaAxios.put).toHaveBeenCalled()
  })
})

// ─── endSession ───────────────────────────────────────────────────────────────

describe('endSession', () => {
  it('calls sendBeacon with the session end URL', () => {
    endSession(TEST_SESSION)

    expect(navigator.sendBeacon).toHaveBeenCalledOnce()
    const [url] = navigator.sendBeacon.mock.calls[0]
    expect(url).toContain(`${TEST_API_BASE}/pwa/session/end`)
  })

  it('appends device_token as query param when present in URL', () => {
    getDeviceConfig.mockReturnValue({ device_token: 'tok-abc123' })
    endSession(TEST_SESSION)

    const [url] = navigator.sendBeacon.mock.calls[0]
    expect(url).toContain('device_token=tok-abc123')
  })

  it('omits device_token query param when not in URL', () => {
    getDeviceConfig.mockReturnValue(null)
    endSession(TEST_SESSION)

    const [url] = navigator.sendBeacon.mock.calls[0]
    expect(url).not.toContain('device_token')
  })

  it('sends a Blob with correct JSON payload (session_id snake_case)', async () => {
    endSession(TEST_SESSION, 'timeout')

    const [, blob] = navigator.sendBeacon.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/json')

    const payload = JSON.parse(await blob.text())
    expect(payload).toEqual({ session_id: TEST_SESSION, end_reason: 'timeout' })
  })

  it('defaults end_reason to journey_complete', async () => {
    endSession(TEST_SESSION)

    const [, blob] = navigator.sendBeacon.mock.calls[0]
    const payload  = JSON.parse(await blob.text())
    expect(payload.end_reason).toBe('journey_complete')
  })

  it('accepts operating_hours as end_reason', async () => {
    endSession(TEST_SESSION, 'operating_hours')

    const [, blob] = navigator.sendBeacon.mock.calls[0]
    const payload  = JSON.parse(await blob.text())
    expect(payload.end_reason).toBe('operating_hours')
  })

  it('calls clearSessionState to wipe localStorage', () => {
    endSession(TEST_SESSION)

    expect(clearSessionState).toHaveBeenCalledOnce()
  })

  it('does not use pwaAxios for session end', () => {
    endSession(TEST_SESSION)

    expect(pwaAxios.post).not.toHaveBeenCalled()
    expect(pwaAxios.put).not.toHaveBeenCalled()
  })
})
