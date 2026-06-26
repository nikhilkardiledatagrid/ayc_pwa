import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pwaApiService, safeFetch, queuedPost } from '../core/api/pwaApiService'
import { getPendingOutboxItems, clearOutbox } from '../core/db/aycDb'

vi.mock('../core/api/pwaAxios', () => ({
  default: {
    get:    vi.fn().mockResolvedValue({ data: { success: true } }),
    post:   vi.fn().mockResolvedValue({ data: { success: true } }),
    put:    vi.fn().mockResolvedValue({ data: { success: true } }),
    patch:  vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

import pwaAxios from '../core/api/pwaAxios'

beforeEach(async () => {
  vi.clearAllMocks()
  // Default: online
  Object.defineProperty(navigator, 'onLine', { writable: true, value: true })
  await clearOutbox()
})

// ─── pwaApiService methods ────────────────────────────────────────────────────

describe('pwaApiService.get', () => {
  it('calls pwaAxios.get with the url and params object', async () => {
    await pwaApiService.get('/pwa/config', { venue_id: '3' })

    expect(pwaAxios.get).toHaveBeenCalledWith('/pwa/config', { params: { venue_id: '3' } })
  })

  it('defaults params to an empty object when omitted', async () => {
    await pwaApiService.get('/pwa/config')

    expect(pwaAxios.get).toHaveBeenCalledWith('/pwa/config', { params: {} })
  })
})

describe('pwaApiService.post', () => {
  it('calls pwaAxios.post with url and data', async () => {
    await pwaApiService.post('/pwa/events', { event_type: 'tap' })

    expect(pwaAxios.post).toHaveBeenCalledWith('/pwa/events', { event_type: 'tap' })
  })

  it('defaults data to empty object when omitted', async () => {
    await pwaApiService.post('/pwa/session/start')

    expect(pwaAxios.post).toHaveBeenCalledWith('/pwa/session/start', {})
  })
})

describe('pwaApiService.put', () => {
  it('calls pwaAxios.put with url and data', async () => {
    await pwaApiService.put('/pwa/session/upgrade', { sessionId: 'abc' })

    expect(pwaAxios.put).toHaveBeenCalledWith('/pwa/session/upgrade', { sessionId: 'abc' })
  })
})

describe('pwaApiService.patch', () => {
  it('calls pwaAxios.patch with url and data', async () => {
    await pwaApiService.patch('/pwa/order/1', { status: 'ready' })

    expect(pwaAxios.patch).toHaveBeenCalledWith('/pwa/order/1', { status: 'ready' })
  })
})

describe('pwaApiService.delete', () => {
  it('calls pwaAxios.delete with the url', async () => {
    await pwaApiService.delete('/pwa/order/basket/1/item/2')

    expect(pwaAxios.delete).toHaveBeenCalledWith('/pwa/order/basket/1/item/2')
  })
})

describe('pwaApiService.upload', () => {
  it('calls pwaAxios.post with multipart/form-data header', async () => {
    const fd = new FormData()
    fd.append('file', new Blob(['content']))

    await pwaApiService.upload('/pwa/upload', fd)

    expect(pwaAxios.post).toHaveBeenCalledWith(
      '/pwa/upload',
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
  })
})

// ─── safeFetch ────────────────────────────────────────────────────────────────

describe('safeFetch — online', () => {
  it('calls the apiCall and returns its result when online', async () => {
    const apiCall = vi.fn().mockResolvedValue({ data: 'ok' })

    const result = await safeFetch(apiCall)

    expect(apiCall).toHaveBeenCalledOnce()
    expect(result).toEqual({ data: 'ok' })
  })

  it('does not fire ayc:offline when online and call succeeds', async () => {
    const offlineListener = vi.fn()
    window.addEventListener('ayc:offline', offlineListener)

    await safeFetch(vi.fn().mockResolvedValue({}))

    expect(offlineListener).not.toHaveBeenCalled()
    window.removeEventListener('ayc:offline', offlineListener)
  })

  it('re-throws non-network errors (4xx/5xx) without firing ayc:offline', async () => {
    const offlineListener = vi.fn()
    window.addEventListener('ayc:offline', offlineListener)
    const serverError = Object.assign(new Error('Not Found'), { code: undefined, response: { status: 404 } })

    await expect(safeFetch(() => Promise.reject(serverError))).rejects.toThrow('Not Found')
    expect(offlineListener).not.toHaveBeenCalled()

    window.removeEventListener('ayc:offline', offlineListener)
  })

  it('fires ayc:offline and re-throws on ERR_NETWORK', async () => {
    const offlineListener = vi.fn()
    window.addEventListener('ayc:offline', offlineListener)
    const netError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })

    await expect(safeFetch(() => Promise.reject(netError))).rejects.toThrow()
    expect(offlineListener).toHaveBeenCalledOnce()

    window.removeEventListener('ayc:offline', offlineListener)
  })
})

describe('safeFetch — offline (navigator.onLine = false)', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })
  })

  it('returns the fallback without calling apiCall', async () => {
    const apiCall = vi.fn()

    const result = await safeFetch(apiCall, null)

    expect(apiCall).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  it('returns a custom fallback value when provided', async () => {
    const result = await safeFetch(vi.fn(), [])

    expect(result).toEqual([])
  })

  it('fires the ayc:offline custom event', async () => {
    const offlineListener = vi.fn()
    window.addEventListener('ayc:offline', offlineListener)

    await safeFetch(vi.fn())

    expect(offlineListener).toHaveBeenCalledOnce()
    window.removeEventListener('ayc:offline', offlineListener)
  })
})

// ─── queuedPost ───────────────────────────────────────────────────────────────

describe('queuedPost — online success', () => {
  it('POSTs immediately and returns the axios response', async () => {
    pwaAxios.post.mockResolvedValue({ data: { success: true, data: { id: 1 } } })

    const result = await queuedPost('/pwa/loyalty/enrol', { name: 'Sam' })

    expect(pwaAxios.post).toHaveBeenCalledWith('/pwa/loyalty/enrol', { name: 'Sam' })
    expect(result.data.success).toBe(true)
  })

  it('does not queue anything on success', async () => {
    pwaAxios.post.mockResolvedValue({ data: { success: true } })

    await queuedPost('/pwa/wifi/log', { mobile: '+971500000000' })

    expect(await getPendingOutboxItems('form')).toHaveLength(0)
  })

  it('re-throws non-network errors (e.g. 422 validation) without queuing', async () => {
    const validationError = Object.assign(new Error('Validation failed'), {
      code: undefined,
      response: { status: 422, data: { message: 'Invalid phone' } },
    })
    pwaAxios.post.mockRejectedValue(validationError)

    await expect(queuedPost('/pwa/wifi/log', { mobile: 'bad' })).rejects.toThrow('Validation failed')
    expect(await getPendingOutboxItems('form')).toHaveLength(0)
  })
})

describe('queuedPost — network failure', () => {
  it('queues to the outbox on ERR_NETWORK and returns { queued: true }', async () => {
    const netError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })
    pwaAxios.post.mockRejectedValue(netError)

    const result = await queuedPost('/pwa/capture/review-intent', { rating: 5, session_id: 'sess-1' }, { sessionId: 'sess-1' })

    expect(result).toMatchObject({ queued: true })
    const pending = await getPendingOutboxItems('form')
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      kind: 'form',
      endpoint: '/pwa/capture/review-intent',
      session_id: 'sess-1',
    })
    expect(pending[0].payload).toMatchObject({ rating: 5, session_id: 'sess-1' })
    expect(pending[0].payload.idempotency_key).toBeTruthy()
  })

  it('falls back to session_id from the payload when not passed explicitly', async () => {
    pwaAxios.post.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))

    await queuedPost('/pwa/loyalty/enrol', { name: 'Sam', session_id: 'sess-2' })

    const [pending] = await getPendingOutboxItems('form')
    expect(pending.session_id).toBe('sess-2')
  })
})

describe('queuedPost — offline (navigator.onLine = false)', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })
  })

  it('queues without attempting the network call', async () => {
    const result = await queuedPost('/pwa/wifi/log', { mobile: '+971500000000', session_id: 'sess-3' })

    expect(pwaAxios.post).not.toHaveBeenCalled()
    expect(result).toMatchObject({ queued: true })
    expect(await getPendingOutboxItems('form')).toHaveLength(1)
  })

  it('fires the ayc:offline custom event', async () => {
    const offlineListener = vi.fn()
    window.addEventListener('ayc:offline', offlineListener)

    await queuedPost('/pwa/wifi/log', { session_id: 'sess-4' })

    expect(offlineListener).toHaveBeenCalledOnce()
    window.removeEventListener('ayc:offline', offlineListener)
  })
})
