import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  logEvent,
  flushQueue,
  getQueueLength,
  clearQueue,
} from '../core/utils/eventQueue'

vi.mock('../core/api/pwaAxios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

import pwaAxios from '../core/api/pwaAxios'

beforeEach(async () => {
  vi.clearAllMocks()
  await clearQueue()
  // Default: post resolves (network healthy)
  pwaAxios.post.mockResolvedValue({ data: { success: true } })
})

// ─── logEvent — happy path ────────────────────────────────────────────────────

describe('logEvent — successful delivery', () => {
  it('POSTs to /pwa/events with the enriched payload', async () => {
    await logEvent({ event_type: 'item_viewed', item_id: 42 })

    expect(pwaAxios.post).toHaveBeenCalledOnce()
    expect(pwaAxios.post).toHaveBeenCalledWith(
      '/pwa/events',
      expect.objectContaining({ event_type: 'item_viewed', item_id: 42 }),
    )
  })

  it('adds timestamp_utc as an ISO string', async () => {
    await logEvent({ event_type: 'page_view' })

    const payload = pwaAxios.post.mock.calls[0][1]
    expect(payload.timestamp_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('adds client_queued_at as a number (epoch ms)', async () => {
    const before = Date.now()
    await logEvent({ event_type: 'page_view' })
    const after = Date.now()

    const payload = pwaAxios.post.mock.calls[0][1]
    expect(typeof payload.client_queued_at).toBe('number')
    expect(payload.client_queued_at).toBeGreaterThanOrEqual(before)
    expect(payload.client_queued_at).toBeLessThanOrEqual(after)
  })

  it('does not add to the queue on success', async () => {
    await logEvent({ event_type: 'item_viewed' })

    expect(await getQueueLength()).toBe(0)
  })
})

// ─── logEvent — network failure (durable queueing) ────────────────────────────

describe('logEvent — network failure', () => {
  beforeEach(() => {
    pwaAxios.post.mockRejectedValue(new Error('ERR_NETWORK'))
  })

  it('queues the event when the POST fails', async () => {
    await logEvent({ event_type: 'item_viewed' })

    expect(await getQueueLength()).toBe(1)
  })

  it('queues the enriched event (with timestamps)', async () => {
    await logEvent({ event_type: 'cart_add', item_id: 7 })

    expect(await getQueueLength()).toBe(1)
  })

  it('queues multiple failed events in order', async () => {
    await logEvent({ event_type: 'a' })
    await logEvent({ event_type: 'b' })
    await logEvent({ event_type: 'c' })

    expect(await getQueueLength()).toBe(3)
  })
})

// ─── durability — no fixed count cap ──────────────────────────────────────────
// Replaces the old 100-event in-memory cap: IndexedDB has far more headroom,
// so nothing is dropped on count. Growth is bounded by age instead
// (OUTBOX_MAX_AGE_MS in aycDb.js), not by how many events have queued.

describe('durable outbox — no count cap', () => {
  beforeEach(() => {
    pwaAxios.post.mockRejectedValue(new Error('ERR_NETWORK'))
  })

  it('retains every event past the old 100-event cap', async () => {
    for (let i = 0; i < 150; i++) {
      await logEvent({ event_type: 'overflow', seq: i })
    }

    expect(await getQueueLength()).toBe(150)
  })
})

// ─── flushQueue ───────────────────────────────────────────────────────────────

describe('flushQueue', () => {
  it('does nothing when queue is empty', async () => {
    await flushQueue()

    expect(pwaAxios.post).not.toHaveBeenCalled()
  })

  it('sends all queued events as one batch and empties the queue on success', async () => {
    // Queue 3 events while network is down
    pwaAxios.post.mockRejectedValue(new Error('ERR_NETWORK'))
    await logEvent({ event_type: 'a' })
    await logEvent({ event_type: 'b' })
    await logEvent({ event_type: 'c' })
    expect(await getQueueLength()).toBe(3)

    // Network recovers
    pwaAxios.post.mockResolvedValue({ data: { success: true } })
    await flushQueue()

    expect(await getQueueLength()).toBe(0)
    // 3 individual sends (all failed, queued) + 1 batch flush call = 4
    expect(pwaAxios.post).toHaveBeenCalledTimes(4)
  })

  it('re-enqueues events that fail during flush', async () => {
    // Queue 2 events
    pwaAxios.post.mockRejectedValue(new Error('ERR_NETWORK'))
    await logEvent({ event_type: 'a' })
    await logEvent({ event_type: 'b' })

    // Flush also fails
    await flushQueue()

    expect(await getQueueLength()).toBe(2)
  })

  it('sends queued events to /pwa/events/batch as { events: [...] }', async () => {
    pwaAxios.post.mockRejectedValueOnce(new Error('ERR_NETWORK'))
    await logEvent({ event_type: 'queued_event' })

    pwaAxios.post.mockResolvedValue({ data: { success: true } })
    await flushQueue()

    const flushCall = pwaAxios.post.mock.calls[1]
    expect(flushCall[0]).toBe('/pwa/events/batch')
    expect(flushCall[1].events).toHaveLength(1)
    expect(flushCall[1].events[0]).toMatchObject({ event_type: 'queued_event' })
  })

  it('chunks more than 100 queued events into multiple batch requests', async () => {
    pwaAxios.post.mockRejectedValue(new Error('ERR_NETWORK'))
    for (let i = 0; i < 150; i++) {
      await logEvent({ event_type: 'overflow', seq: i })
    }
    expect(await getQueueLength()).toBe(150)

    pwaAxios.post.mockClear()
    pwaAxios.post.mockResolvedValue({ data: { success: true } })
    await flushQueue()

    expect(pwaAxios.post).toHaveBeenCalledTimes(2) // 100 + 50
    expect(pwaAxios.post.mock.calls[0][1].events).toHaveLength(100)
    expect(pwaAxios.post.mock.calls[1][1].events).toHaveLength(50)
    expect(await getQueueLength()).toBe(0)
  })
})

// ─── online event listener ────────────────────────────────────────────────────

describe('online event listener', () => {
  it('flushes the queue when the online event fires', async () => {
    // Queue an event
    pwaAxios.post.mockRejectedValueOnce(new Error('ERR_NETWORK'))
    await logEvent({ event_type: 'offline_event' })
    expect(await getQueueLength()).toBe(1)

    // Network recovers — simulate 'online' event
    pwaAxios.post.mockResolvedValue({ data: { success: true } })
    window.dispatchEvent(new Event('online'))

    // flushQueue is async; wait for microtasks to settle
    await vi.waitFor(async () => expect(await getQueueLength()).toBe(0))
  })
})
