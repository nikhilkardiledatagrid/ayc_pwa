import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  TIMEOUT_DEFAULTS,
  configureTimeouts,
  startTimeout,
  stopTimeout,
  stopAllTimeouts,
  getTimeoutMs,
  resetTimeoutManager,
} from '../core/utils/timeoutManager'

beforeEach(() => {
  vi.useFakeTimers()
  resetTimeoutManager()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── TIMEOUT_DEFAULTS ─────────────────────────────────────────────────────────

describe('TIMEOUT_DEFAULTS', () => {
  it('exports all 6 required timeout keys', () => {
    const keys = Object.keys(TIMEOUT_DEFAULTS)
    expect(keys).toContain('session_idle_ms')
    expect(keys).toContain('wifi_display_ms')
    expect(keys).toContain('order_status_ms')
    expect(keys).toContain('game_session_ms')
    expect(keys).toContain('lead_form_ms')
    expect(keys).toContain('post_order_return_ms')
  })

  it('all default values are positive numbers', () => {
    for (const [key, ms] of Object.entries(TIMEOUT_DEFAULTS)) {
      expect(typeof ms, key).toBe('number')
      expect(ms, key).toBeGreaterThan(0)
    }
  })
})

// ─── configureTimeouts ────────────────────────────────────────────────────────

describe('configureTimeouts', () => {
  it('overrides a specific key with the venue value', () => {
    configureTimeouts({ wifi_display_ms: 5000 })

    expect(getTimeoutMs('wifi_display_ms')).toBe(5000)
  })

  it('leaves other keys at their defaults when only one is overridden', () => {
    configureTimeouts({ wifi_display_ms: 5000 })

    expect(getTimeoutMs('session_idle_ms')).toBe(TIMEOUT_DEFAULTS.session_idle_ms)
    expect(getTimeoutMs('game_session_ms')).toBe(TIMEOUT_DEFAULTS.game_session_ms)
  })

  it('applies all keys when a full config object is provided', () => {
    configureTimeouts({
      wifi_display_ms: 2000,
      lead_form_ms:    3000,
    })

    expect(getTimeoutMs('wifi_display_ms')).toBe(2000)
    expect(getTimeoutMs('lead_form_ms')).toBe(3000)
  })

  it('treats an empty object as no-op — defaults remain', () => {
    configureTimeouts({})

    expect(getTimeoutMs('wifi_display_ms')).toBe(TIMEOUT_DEFAULTS.wifi_display_ms)
  })

  it('treats no argument as no-op — defaults remain', () => {
    configureTimeouts()

    expect(getTimeoutMs('wifi_display_ms')).toBe(TIMEOUT_DEFAULTS.wifi_display_ms)
  })
})

// ─── startTimeout ─────────────────────────────────────────────────────────────

describe('startTimeout', () => {
  it('fires the callback after the configured duration', () => {
    configureTimeouts({ wifi_display_ms: 1000 })
    const cb = vi.fn()

    startTimeout('wifi_display_ms', cb)
    expect(cb).not.toHaveBeenCalled()

    vi.advanceTimersByTime(999)
    expect(cb).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('replaces an existing timer with the same key — callback fires only once', () => {
    configureTimeouts({ wifi_display_ms: 1000 })
    const cb = vi.fn()

    startTimeout('wifi_display_ms', cb)
    startTimeout('wifi_display_ms', cb) // replaces the first

    vi.advanceTimersByTime(2000)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('does nothing when the key is not in the config', () => {
    const cb = vi.fn()

    startTimeout('unknown_key_ms', cb)
    vi.advanceTimersByTime(999999)

    expect(cb).not.toHaveBeenCalled()
  })

  it('supports multiple independent named timers', () => {
    configureTimeouts({ wifi_display_ms: 1000, lead_form_ms: 2000 })
    const wifiCb = vi.fn()
    const leadCb = vi.fn()

    startTimeout('wifi_display_ms', wifiCb)
    startTimeout('lead_form_ms', leadCb)

    vi.advanceTimersByTime(1000)
    expect(wifiCb).toHaveBeenCalledOnce()
    expect(leadCb).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(leadCb).toHaveBeenCalledOnce()
  })
})

// ─── stopTimeout ─────────────────────────────────────────────────────────────

describe('stopTimeout', () => {
  it('prevents the callback from firing after stop', () => {
    configureTimeouts({ wifi_display_ms: 1000 })
    const cb = vi.fn()

    startTimeout('wifi_display_ms', cb)
    stopTimeout('wifi_display_ms')
    vi.advanceTimersByTime(2000)

    expect(cb).not.toHaveBeenCalled()
  })

  it('is safe to call when no timer is running for that key', () => {
    expect(() => stopTimeout('wifi_display_ms')).not.toThrow()
  })
})

// ─── stopAllTimeouts ──────────────────────────────────────────────────────────

describe('stopAllTimeouts', () => {
  it('cancels all running timers', () => {
    configureTimeouts({ wifi_display_ms: 1000, lead_form_ms: 2000 })
    const wifiCb = vi.fn()
    const leadCb = vi.fn()

    startTimeout('wifi_display_ms', wifiCb)
    startTimeout('lead_form_ms', leadCb)
    stopAllTimeouts()

    vi.advanceTimersByTime(5000)
    expect(wifiCb).not.toHaveBeenCalled()
    expect(leadCb).not.toHaveBeenCalled()
  })

  it('is safe to call when no timers are running', () => {
    expect(() => stopAllTimeouts()).not.toThrow()
  })
})

// ─── getTimeoutMs ─────────────────────────────────────────────────────────────

describe('getTimeoutMs', () => {
  it('returns the default value before any config is applied', () => {
    expect(getTimeoutMs('session_idle_ms')).toBe(TIMEOUT_DEFAULTS.session_idle_ms)
  })

  it('returns the overridden value after configureTimeouts', () => {
    configureTimeouts({ session_idle_ms: 9000 })
    expect(getTimeoutMs('session_idle_ms')).toBe(9000)
  })

  it('returns undefined for an unknown key', () => {
    expect(getTimeoutMs('does_not_exist')).toBeUndefined()
  })
})

// ─── resetTimeoutManager ─────────────────────────────────────────────────────

describe('resetTimeoutManager', () => {
  it('restores all defaults after a config override', () => {
    configureTimeouts({ wifi_display_ms: 999 })
    resetTimeoutManager()

    expect(getTimeoutMs('wifi_display_ms')).toBe(TIMEOUT_DEFAULTS.wifi_display_ms)
  })

  it('cancels any active timers on reset', () => {
    configureTimeouts({ wifi_display_ms: 1000 })
    const cb = vi.fn()
    startTimeout('wifi_display_ms', cb)

    resetTimeoutManager()
    vi.advanceTimersByTime(2000)

    expect(cb).not.toHaveBeenCalled()
  })
})
