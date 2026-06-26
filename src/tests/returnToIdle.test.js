import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../core/utils/eventQueue', () => ({ logEvent: vi.fn() }))
vi.mock('../core/utils/sessionManager', () => ({ endSessionGlobally: vi.fn() }))

import { returnToIdle } from '../core/utils/returnToIdle'
import { logEvent } from '../core/utils/eventQueue'
import { endSessionGlobally } from '../core/utils/sessionManager'

// Give location a writable href so we can assert navigation
Object.defineProperty(window, 'location', {
  writable: true,
  value: { href: '' },
})

const setParentFrame = (postMessageFn) => {
  Object.defineProperty(window, 'parent', {
    configurable: true,
    writable: true,
    value: { postMessage: postMessageFn },
  })
}

const restoreParent = () => {
  Object.defineProperty(window, 'parent', {
    configurable: true,
    writable: true,
    value: window,
  })
}

beforeEach(() => {
  window.location.href = ''
  restoreParent()
  vi.clearAllMocks()
})

afterEach(() => {
  restoreParent()
})

describe('returnToIdle — postMessage (WebView context)', () => {
  it('sends ayc_return_idle postMessage when inside a parent frame', () => {
    const postMessage = vi.fn()
    setParentFrame(postMessage)

    returnToIdle()

    expect(postMessage).toHaveBeenCalledOnce()
    expect(postMessage).toHaveBeenCalledWith({ type: 'ayc_return_idle' }, '*')
  })

  it('does NOT call postMessage when there is no parent frame', () => {
    const postMessage = vi.fn()
    // parent === window by default (no frame)

    returnToIdle()

    expect(postMessage).not.toHaveBeenCalled()
  })

  it('uses wildcard origin * in postMessage', () => {
    const postMessage = vi.fn()
    setParentFrame(postMessage)

    returnToIdle({ return_url: 'https://example.com' })

    expect(postMessage).toHaveBeenCalledWith(expect.anything(), '*')
  })
})

describe('returnToIdle — URL fallback navigation', () => {
  it('navigates to return_url when provided', () => {
    returnToIdle({ return_url: 'https://pwa.ayc.ae/idle' })

    expect(window.location.href).toBe('https://pwa.ayc.ae/idle')
  })

  it('does not navigate when return_url is absent', () => {
    returnToIdle({})

    expect(window.location.href).toBe('')
  })

  it('does not navigate when config is undefined', () => {
    returnToIdle()

    expect(window.location.href).toBe('')
  })

  it('does not navigate when config is null', () => {
    returnToIdle(null)

    expect(window.location.href).toBe('')
  })
})

describe('returnToIdle — both signals fire together', () => {
  it('sends postMessage AND navigates when in a frame with return_url', () => {
    const postMessage = vi.fn()
    setParentFrame(postMessage)

    returnToIdle({ return_url: 'https://pwa.ayc.ae/idle' })

    expect(postMessage).toHaveBeenCalledOnce()
    expect(window.location.href).toBe('https://pwa.ayc.ae/idle')
  })
})

describe('returnToIdle — session end', () => {
  it('does NOT log SESSION_END or end the session when sessionId is omitted', () => {
    returnToIdle({ return_url: 'https://pwa.ayc.ae/idle' })

    expect(logEvent).not.toHaveBeenCalled()
    expect(endSessionGlobally).not.toHaveBeenCalled()
  })

  it('logs SESSION_END and calls endSessionGlobally when sessionId is provided', () => {
    returnToIdle({ return_url: 'https://pwa.ayc.ae/idle' }, 'session-123')

    expect(logEvent).toHaveBeenCalledWith({
      event_type: 'session_end',
      session_id: 'session-123',
      reason:     'timeout',
    })
    expect(endSessionGlobally).toHaveBeenCalledWith('session-123', 'timeout')
  })

  it('defaults reason to "timeout" when not given', () => {
    returnToIdle({}, 'session-123')

    expect(endSessionGlobally).toHaveBeenCalledWith('session-123', 'timeout')
  })

  it('passes through an explicit reason such as "journey_complete"', () => {
    returnToIdle({}, 'session-123', 'journey_complete')

    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ reason: 'journey_complete' }))
    expect(endSessionGlobally).toHaveBeenCalledWith('session-123', 'journey_complete')
  })

  it('still fires postMessage/navigate alongside session end', () => {
    const postMessage = vi.fn()
    setParentFrame(postMessage)

    returnToIdle({ return_url: 'https://pwa.ayc.ae/idle' }, 'session-123')

    expect(postMessage).toHaveBeenCalledWith({ type: 'ayc_return_idle' }, '*')
    expect(window.location.href).toBe('https://pwa.ayc.ae/idle')
  })
})
