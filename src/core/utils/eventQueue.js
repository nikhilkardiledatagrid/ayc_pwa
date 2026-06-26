/**
 * Offline-safe event queue for the AYC PWA.
 *
 * ALL guest events MUST go through logEvent() — never POST to /pwa/events directly.
 * Events are sent immediately. On network failure they are persisted to the
 * IndexedDB outbox (see aycDb.js) and retried automatically when the device
 * comes back online — durable across reloads/crashes, not just in-memory.
 *
 * No fixed count cap (IndexedDB has far more headroom than the old 100-event
 * in-memory array). Rows are bounded by age instead — anything older than
 * OUTBOX_MAX_AGE_MS (aycDb.js, 72h) is purged on every flush regardless of
 * sync status, so a device that never reconnects can't grow this unbounded.
 *
 * DO NOT regenerate this file. Contact Rushiraj if behaviour must change.
 */

import pwaAxios from '../api/pwaAxios'
import { addOutboxItem, getPendingOutboxItems, markOutboxSynced, markOutboxFailed, getOutboxCount, clearOutbox } from '../db/aycDb'

const KIND = 'event'
const ENDPOINT = '/pwa/events'
const BATCH_ENDPOINT = '/pwa/events/batch'
const BATCH_SIZE = 100 // matches PwaEventBatchRequest's max:100 validation rule

let isFlushing = false

/**
 * Log a guest event. Sends immediately; queues on any network failure.
 * Adds timestamp_utc and client_queued_at automatically.
 *
 * @param {{ event_type: string, [key: string]: unknown }} eventData
 */
export const logEvent = async (eventData) => {
  const enriched = {
    ...eventData,
    timestamp_utc:    new Date().toISOString(),
    client_queued_at: Date.now(),
  }
  try {
    await pwaAxios.post(ENDPOINT, enriched)
  } catch {
    await addOutboxItem({ kind: KIND, endpoint: ENDPOINT, payload: enriched, session_id: enriched.session_id ?? null })
  }
}

/**
 * Retry all queued events via POST /pwa/events/batch (chunked at BATCH_SIZE) —
 * the backend route built specifically for flushing this queue, rather than
 * one request per event. Events within a chunk that fail are retried as a
 * chunk next flush (the batch endpoint is all-or-nothing per request).
 * Concurrent calls are a no-op — one flush at a time.
 */
export const flushQueue = async () => {
  if (isFlushing) return
  isFlushing = true

  try {
    const pending = await getPendingOutboxItems(KIND)
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const chunk = pending.slice(i, i + BATCH_SIZE)
      try {
        await pwaAxios.post(BATCH_ENDPOINT, { events: chunk.map((item) => item.payload) })
        await Promise.all(chunk.map((item) => markOutboxSynced(item.id)))
      } catch {
        await Promise.all(chunk.map((item) => markOutboxFailed(item.id, 'network error')))
      }
    }
  } finally {
    isFlushing = false
  }
}

/** @returns {Promise<number>} Number of events currently waiting to be sent */
export const getQueueLength = () => getOutboxCount(KIND)

/** Discard all pending events. Call when the session ends and delivery is no longer needed. */
export const clearQueue = () => clearOutbox(KIND)

// Automatically flush whenever the device regains network connectivity
window.addEventListener('online', flushQueue)
