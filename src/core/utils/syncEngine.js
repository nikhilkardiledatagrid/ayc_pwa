/**
 * Outbox sync engine for the AYC PWA.
 *
 * Drains pending/failed 'form' outbox rows (lead/loyalty/review/waiter-call/
 * wifi submits — see pwaApiService.queuedPost) to the backend once the device
 * is back online. Order placement (KeyConnect/Grubtech basket + checkout)
 * never enters the outbox and is therefore never replayed here — that flow
 * stays synchronous/online-only.
 *
 * Deliberately scoped to kind:'form' only — 'event' rows are flushed by
 * eventQueue.js's own flushQueue(), which also listens for 'online'. Both
 * modules processing the same kind would race (two listeners could each pick
 * up the same pending row before either marks it synced, double-submitting
 * it to the backend). One kind, one owner.
 *
 * Replay is grouped by session_id so writes within one guest's journey land
 * in the order they happened. A failure stops that group (preserves order,
 * retried on the next flush) without blocking unrelated groups.
 *
 * DO NOT regenerate this file. Contact Rushiraj if behaviour must change.
 */

import pwaAxios from '../api/pwaAxios'
import {
  getPendingOutboxItems,
  markOutboxSynced,
  markOutboxFailed,
  purgeOldOutboxItems,
} from '../db/aycDb'

const FORM_KIND = 'form'

let isFlushing = false
let intervalHandle = null

const groupBySession = (items) => {
  const groups = new Map()
  for (const item of items) {
    const groupKey = item.session_id ?? 'none'
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey).push(item)
  }
  return Array.from(groups.values())
}

/**
 * Replay every queued 'form' outbox row in order. Concurrent calls are a
 * no-op — one flush at a time, mirroring the existing eventQueue.js pattern.
 */
export const flushOutbox = async () => {
  if (isFlushing || !navigator.onLine) return
  isFlushing = true
  try {
    await purgeOldOutboxItems()
    const groups = groupBySession(await getPendingOutboxItems(FORM_KIND))

    await Promise.all(
      groups.map(async (group) => {
        for (const item of group) {
          try {
            await pwaAxios.post(item.endpoint, item.payload)
            await markOutboxSynced(item.id)
          } catch (err) {
            await markOutboxFailed(item.id, err?.message)
            break // preserve order within this group — retry from here next flush
          }
        }
      }),
    )
  } finally {
    isFlushing = false
  }
}

/**
 * Wire the outbox to flush automatically: on reconnect, once at boot if
 * already online, and on a periodic safety net (the 'online' event isn't
 * always reliable across every network transition).
 */
export const startSyncEngine = () => {
  window.addEventListener('online', flushOutbox)
  if (navigator.onLine) flushOutbox()
  if (!intervalHandle) {
    intervalHandle = setInterval(() => flushOutbox(), 60 * 1000)
  }
}

/** Only for tests — stops the periodic interval and listener. */
export const _stopSyncEngineForTests = () => {
  window.removeEventListener('online', flushOutbox)
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
