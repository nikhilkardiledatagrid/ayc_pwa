/**
 * IndexedDB persistence layer for the AYC PWA offline architecture.
 *
 * Two object stores, one database:
 *   - reference_cache  Non-personal, device-level data (menu, device/session
 *                       config). Never session-scoped, never wiped on
 *                       session end — only ever overwritten by a fresher fetch.
 *   - outbox            Guest-generated writes (analytics events, lead/loyalty/
 *                       review/waiter-call/wifi form submits) queued while
 *                       offline. Session-tagged, replayed in order by
 *                       syncEngine.js, purged once synced or past OUTBOX_MAX_AGE_MS.
 *
 * Order placement (KeyConnect/Grubtech basket + checkout) deliberately never
 * goes through this file — those calls stay synchronous/online-only.
 *
 * DO NOT regenerate this file. Contact Rushiraj if behaviour must change.
 */

import { openDB } from 'idb'

const DB_NAME    = 'ayc_pwa'
const DB_VERSION = 1

const STORE_REFERENCE = 'reference_cache'
const STORE_OUTBOX     = 'outbox'

/** Rows older than this are purged on every flush, synced or not — bounds
 *  worst-case growth if a device stays offline indefinitely. */
export const OUTBOX_MAX_AGE_MS = 72 * 60 * 60 * 1000 // 72h

let dbPromise = null

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_REFERENCE)) {
          db.createObjectStore(STORE_REFERENCE, { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          const store = db.createObjectStore(STORE_OUTBOX, { keyPath: 'id', autoIncrement: true })
          store.createIndex('by_status', 'status')
          store.createIndex('by_kind', 'kind')
        }
      },
    })

    // Best-effort: ask the browser not to evict this origin's storage under
    // pressure, since outbox rows are unsynced guest data, not disposable cache.
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {})
    }
  }
  return dbPromise
}

/** Only for tests — forces a fresh DB connection against a clean fake-indexeddb instance. */
export const _resetForTests = () => { dbPromise = null }

// ── reference_cache ───────────────────────────────────────────────────────────

/** @returns {Promise<{ key: string, data: unknown, fetched_at: number } | undefined>} */
export const getCacheEntry = async (key) => {
  const db = await getDb()
  return db.get(STORE_REFERENCE, key)
}

/** Overwrites whatever was cached under `key` with fresh data. */
export const setCacheEntry = async (key, data) => {
  const db = await getDb()
  return db.put(STORE_REFERENCE, { key, data, fetched_at: Date.now() })
}

/** Wipe the entire reference cache — e.g. on device re-pairing. */
export const clearReferenceCache = async () => {
  const db = await getDb()
  return db.clear(STORE_REFERENCE)
}

// ── outbox ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} OutboxItem
 * @property {number}      id
 * @property {'event'|'form'} kind
 * @property {string}      endpoint
 * @property {object}      payload
 * @property {string|null} session_id
 * @property {string}      idempotency_key
 * @property {'pending'|'failed'} status
 * @property {number}      attempts
 * @property {string|null} last_error
 * @property {number}      created_at
 */

/**
 * Queue a guest-generated write for later delivery.
 *
 * idempotency_key is merged into the stored payload (not just kept as row
 * metadata) so it actually reaches the backend on replay — syncEngine.js and
 * eventQueue.js both POST `item.payload` as-is, with no special-casing.
 *
 * @param {{ kind: 'event'|'form', endpoint: string, payload: object, session_id?: string|null }} item
 * @returns {Promise<number>} the new outbox row id
 */
export const addOutboxItem = async ({ kind, endpoint, payload, session_id = null }) => {
  const db = await getDb()
  const idempotencyKey = crypto.randomUUID()
  return db.add(STORE_OUTBOX, {
    kind,
    endpoint,
    payload: { ...payload, idempotency_key: idempotencyKey },
    session_id,
    idempotency_key: idempotencyKey,
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: Date.now(),
  })
}

/**
 * @param {'event'|'form'} [kind]  When omitted, returns every kind.
 * @returns {Promise<OutboxItem[]>} pending/failed rows, oldest first.
 */
export const getPendingOutboxItems = async (kind) => {
  const db = await getDb()
  const all = await db.getAll(STORE_OUTBOX)
  return all
    .filter((row) => (kind ? row.kind === kind : true))
    .sort((a, b) => a.created_at - b.created_at)
}

/** Delivery succeeded — remove the row. */
export const markOutboxSynced = async (id) => {
  const db = await getDb()
  return db.delete(STORE_OUTBOX, id)
}

/** Delivery failed — keep the row, record the attempt for the next flush. */
export const markOutboxFailed = async (id, errorMessage) => {
  const db = await getDb()
  const row = await db.get(STORE_OUTBOX, id)
  if (!row) return
  row.status     = 'failed'
  row.attempts   += 1
  row.last_error  = errorMessage ?? 'unknown error'
  await db.put(STORE_OUTBOX, row)
}

/** @param {'event'|'form'} [kind] */
export const getOutboxCount = async (kind) => {
  const db = await getDb()
  if (!kind) return db.count(STORE_OUTBOX)
  const all = await db.getAllFromIndex(STORE_OUTBOX, 'by_kind', kind)
  return all.length
}

/** Discard every row of the given kind (or all rows when omitted). */
export const clearOutbox = async (kind) => {
  const db = await getDb()
  if (!kind) {
    return db.clear(STORE_OUTBOX)
  }
  const rows = await db.getAllFromIndex(STORE_OUTBOX, 'by_kind', kind)
  await Promise.all(rows.map((row) => db.delete(STORE_OUTBOX, row.id)))
}

/**
 * Drop rows older than maxAgeMs regardless of status — the safety net for a
 * device that never reconnects. Synced rows are already removed by
 * markOutboxSynced(), so this only ever catches stale 'pending'/'failed' rows.
 */
export const purgeOldOutboxItems = async (maxAgeMs = OUTBOX_MAX_AGE_MS) => {
  const db = await getDb()
  const cutoff = Date.now() - maxAgeMs
  const tx = db.transaction(STORE_OUTBOX, 'readwrite')
  const all = await tx.store.getAll()
  await Promise.all(
    all.filter((row) => row.created_at < cutoff).map((row) => tx.store.delete(row.id)),
  )
  await tx.done
}
