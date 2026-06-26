import { describe, it, expect, beforeEach } from 'vitest'
import {
  getCacheEntry,
  setCacheEntry,
  clearReferenceCache,
  addOutboxItem,
  getPendingOutboxItems,
  markOutboxSynced,
  markOutboxFailed,
  getOutboxCount,
  clearOutbox,
  purgeOldOutboxItems,
} from '../core/db/aycDb'

beforeEach(async () => {
  await clearReferenceCache()
  await clearOutbox()
})

// ─── reference_cache ──────────────────────────────────────────────────────────

describe('reference_cache', () => {
  it('returns undefined for a key that was never set', async () => {
    expect(await getCacheEntry('menu')).toBeUndefined()
  })

  it('stores and retrieves data under a key', async () => {
    await setCacheEntry('menu', { categories: [{ id: 1 }] })

    const entry = await getCacheEntry('menu')
    expect(entry.data).toEqual({ categories: [{ id: 1 }] })
    expect(typeof entry.fetched_at).toBe('number')
  })

  it('overwrites the previous value for the same key', async () => {
    await setCacheEntry('menu', { categories: [] })
    await setCacheEntry('menu', { categories: [{ id: 2 }] })

    const entry = await getCacheEntry('menu')
    expect(entry.data).toEqual({ categories: [{ id: 2 }] })
  })

  it('keeps separate keys independent', async () => {
    await setCacheEntry('menu', { a: 1 })
    await setCacheEntry('device_config', { b: 2 })

    expect((await getCacheEntry('menu')).data).toEqual({ a: 1 })
    expect((await getCacheEntry('device_config')).data).toEqual({ b: 2 })
  })

  it('clearReferenceCache wipes every key', async () => {
    await setCacheEntry('menu', { a: 1 })
    await setCacheEntry('device_config', { b: 2 })

    await clearReferenceCache()

    expect(await getCacheEntry('menu')).toBeUndefined()
    expect(await getCacheEntry('device_config')).toBeUndefined()
  })
})

// ─── outbox ───────────────────────────────────────────────────────────────────

describe('outbox', () => {
  it('addOutboxItem persists a pending row with an idempotency_key merged into the payload', async () => {
    await addOutboxItem({ kind: 'event', endpoint: '/pwa/events', payload: { event_type: 'page_view' }, session_id: 'sess-1' })

    const [item] = await getPendingOutboxItems()
    expect(item).toMatchObject({
      kind: 'event',
      endpoint: '/pwa/events',
      session_id: 'sess-1',
      status: 'pending',
      attempts: 0,
    })
    expect(item.payload.event_type).toBe('page_view')
    expect(item.payload.idempotency_key).toBeTruthy()
    expect(item.idempotency_key).toBe(item.payload.idempotency_key)
  })

  it('getPendingOutboxItems returns rows oldest-first', async () => {
    await addOutboxItem({ kind: 'event', endpoint: '/a', payload: {} })
    await addOutboxItem({ kind: 'event', endpoint: '/b', payload: {} })
    await addOutboxItem({ kind: 'event', endpoint: '/c', payload: {} })

    const items = await getPendingOutboxItems()
    expect(items.map((i) => i.endpoint)).toEqual(['/a', '/b', '/c'])
  })

  it('getPendingOutboxItems filters by kind when provided', async () => {
    await addOutboxItem({ kind: 'event', endpoint: '/events', payload: {} })
    await addOutboxItem({ kind: 'form', endpoint: '/pwa/wifi/log', payload: {} })

    expect((await getPendingOutboxItems('event')).map((i) => i.endpoint)).toEqual(['/events'])
    expect((await getPendingOutboxItems('form')).map((i) => i.endpoint)).toEqual(['/pwa/wifi/log'])
  })

  it('markOutboxSynced removes the row', async () => {
    const id = await addOutboxItem({ kind: 'event', endpoint: '/a', payload: {} })

    await markOutboxSynced(id)

    expect(await getPendingOutboxItems()).toHaveLength(0)
  })

  it('markOutboxFailed increments attempts and records the error, keeps the row', async () => {
    const id = await addOutboxItem({ kind: 'form', endpoint: '/a', payload: {} })

    await markOutboxFailed(id, 'Network Error')
    await markOutboxFailed(id, 'Network Error')

    const [item] = await getPendingOutboxItems()
    expect(item.status).toBe('failed')
    expect(item.attempts).toBe(2)
    expect(item.last_error).toBe('Network Error')
  })

  it('getOutboxCount counts all rows, or just one kind when given', async () => {
    await addOutboxItem({ kind: 'event', endpoint: '/a', payload: {} })
    await addOutboxItem({ kind: 'event', endpoint: '/b', payload: {} })
    await addOutboxItem({ kind: 'form', endpoint: '/c', payload: {} })

    expect(await getOutboxCount()).toBe(3)
    expect(await getOutboxCount('event')).toBe(2)
    expect(await getOutboxCount('form')).toBe(1)
  })

  it('clearOutbox(kind) only removes rows of that kind', async () => {
    await addOutboxItem({ kind: 'event', endpoint: '/a', payload: {} })
    await addOutboxItem({ kind: 'form', endpoint: '/b', payload: {} })

    await clearOutbox('event')

    expect(await getOutboxCount('event')).toBe(0)
    expect(await getOutboxCount('form')).toBe(1)
  })

  it('clearOutbox() with no kind removes every row', async () => {
    await addOutboxItem({ kind: 'event', endpoint: '/a', payload: {} })
    await addOutboxItem({ kind: 'form', endpoint: '/b', payload: {} })

    await clearOutbox()

    expect(await getOutboxCount()).toBe(0)
  })

  it('purgeOldOutboxItems drops rows older than maxAgeMs', async () => {
    const id = await addOutboxItem({ kind: 'event', endpoint: '/old', payload: {} })

    // Simulate age via a 0ms maxAgeMs window evaluated strictly after the row
    // was created, rather than relying on real wall-clock backdating.
    await new Promise((resolve) => setTimeout(resolve, 5))
    await purgeOldOutboxItems(0)

    const remaining = await getPendingOutboxItems()
    expect(remaining.find((i) => i.id === id)).toBeUndefined()
  })

  it('purgeOldOutboxItems keeps everything when maxAgeMs is large', async () => {
    await addOutboxItem({ kind: 'event', endpoint: '/a', payload: {} })

    await purgeOldOutboxItems(72 * 60 * 60 * 1000)

    expect(await getOutboxCount()).toBe(1)
  })
})
