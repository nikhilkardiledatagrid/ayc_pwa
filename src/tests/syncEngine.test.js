import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushOutbox, startSyncEngine, _stopSyncEngineForTests } from '../core/utils/syncEngine'
import { addOutboxItem, getPendingOutboxItems, clearOutbox } from '../core/db/aycDb'

vi.mock('../core/api/pwaAxios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

import pwaAxios from '../core/api/pwaAxios'

beforeEach(async () => {
  vi.clearAllMocks()
  await clearOutbox()
  Object.defineProperty(navigator, 'onLine', { writable: true, value: true })
  pwaAxios.post.mockResolvedValue({ data: { success: true } })
})

afterEach(() => {
  _stopSyncEngineForTests()
})

describe('flushOutbox', () => {
  it('does nothing when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })
    await addOutboxItem({ kind: 'form', endpoint: '/a', payload: {} })

    await flushOutbox()

    expect(pwaAxios.post).not.toHaveBeenCalled()
    expect(await getPendingOutboxItems()).toHaveLength(1)
  })

  it('does nothing when the outbox is empty', async () => {
    await flushOutbox()

    expect(pwaAxios.post).not.toHaveBeenCalled()
  })

  it('replays a pending row and removes it on success', async () => {
    await addOutboxItem({ kind: 'form', endpoint: '/pwa/wifi/log', payload: { mobile: '+971500000000' } })

    await flushOutbox()

    expect(pwaAxios.post).toHaveBeenCalledWith('/pwa/wifi/log', expect.objectContaining({ mobile: '+971500000000' }))
    expect(await getPendingOutboxItems()).toHaveLength(0)
  })

  it("never touches 'event' kind rows — those belong to eventQueue.js's own flush", async () => {
    await addOutboxItem({ kind: 'event', endpoint: '/pwa/events', payload: {} })

    await flushOutbox()

    expect(pwaAxios.post).not.toHaveBeenCalled()
    expect(await getPendingOutboxItems('event')).toHaveLength(1)
  })

  it('keeps a row queued (status failed) when replay fails, and stops that group', async () => {
    pwaAxios.post.mockRejectedValue(new Error('ERR_NETWORK'))
    await addOutboxItem({ kind: 'form', endpoint: '/a', payload: {}, session_id: 'sess-1' })
    await addOutboxItem({ kind: 'form', endpoint: '/b', payload: {}, session_id: 'sess-1' })

    await flushOutbox()

    const remaining = await getPendingOutboxItems()
    expect(remaining).toHaveLength(2)
    expect(remaining[0].status).toBe('failed')
    expect(remaining[0].attempts).toBe(1)
    // Order preserved within the session group — second item never attempted
    // once the first failed, so it's never even called.
    expect(pwaAxios.post).toHaveBeenCalledTimes(1)
  })

  it('replays independent session groups even when one group fails', async () => {
    pwaAxios.post.mockImplementation((endpoint) =>
      endpoint === '/fails' ? Promise.reject(new Error('ERR_NETWORK')) : Promise.resolve({ data: {} }),
    )
    await addOutboxItem({ kind: 'form', endpoint: '/fails', payload: {}, session_id: 'sess-1' })
    await addOutboxItem({ kind: 'form', endpoint: '/succeeds', payload: {}, session_id: 'sess-2' })

    await flushOutbox()

    const remaining = await getPendingOutboxItems()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].endpoint).toBe('/fails')
  })

  it('replays multiple rows in the same group in creation order', async () => {
    const calls = []
    pwaAxios.post.mockImplementation((endpoint) => { calls.push(endpoint); return Promise.resolve({ data: {} }) })
    await addOutboxItem({ kind: 'form', endpoint: '/1', payload: {}, session_id: 'sess-1' })
    await addOutboxItem({ kind: 'form', endpoint: '/2', payload: {}, session_id: 'sess-1' })
    await addOutboxItem({ kind: 'form', endpoint: '/3', payload: {}, session_id: 'sess-1' })

    await flushOutbox()

    expect(calls).toEqual(['/1', '/2', '/3'])
  })

  it('does not run two flushes concurrently', async () => {
    let resolveFirst
    pwaAxios.post.mockImplementation(() => new Promise((resolve) => { resolveFirst = resolve }))
    await addOutboxItem({ kind: 'form', endpoint: '/a', payload: {} })

    const first = flushOutbox()
    const second = flushOutbox() // no-op — isFlushing guard set synchronously by `first`

    // flushOutbox() awaits purge + getPendingOutboxItems before calling
    // pwaAxios.post, so resolveFirst isn't assigned until those microtasks settle.
    await vi.waitFor(() => expect(resolveFirst).toBeTypeOf('function'))
    resolveFirst({ data: {} })
    await Promise.all([first, second])

    expect(pwaAxios.post).toHaveBeenCalledTimes(1)
  })
})

describe('startSyncEngine', () => {
  it('flushes immediately when already online', async () => {
    await addOutboxItem({ kind: 'form', endpoint: '/a', payload: {} })

    startSyncEngine()
    await vi.waitFor(async () => expect(await getPendingOutboxItems()).toHaveLength(0))
  })

  it('flushes on the online event', async () => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false })
    startSyncEngine()
    await addOutboxItem({ kind: 'form', endpoint: '/a', payload: {} })

    Object.defineProperty(navigator, 'onLine', { writable: true, value: true })
    window.dispatchEvent(new Event('online'))

    await vi.waitFor(async () => expect(await getPendingOutboxItems()).toHaveLength(0))
  })
})
