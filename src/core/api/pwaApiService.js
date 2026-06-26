import pwaAxios from './pwaAxios'
import { addOutboxItem } from '../db/aycDb'

/**
 * Shared HTTP method wrapper for the AYC PWA.
 *
 * All journey and utility code MUST go through this object — never import
 * pwaAxios directly in feature/journey files. One call surface means one
 * place to change error handling, retries, or logging.
 *
 * Contract:
 *   - Methods return the full axios response (caller picks response.data).
 *   - Methods do NOT catch errors — failures bubble to the caller so it can
 *     decide between queueing (eventQueue), retrying, or showing an error screen.
 *
 * For network-failure safety wrap calls with safeFetch() instead of try/catch.
 *
 * Do NOT regenerate this file. Contact Rushiraj if a new method is needed.
 */
export const pwaApiService = {
  /** GET with optional query params. */
  get(url, params = {}) {
    return pwaAxios.get(url, { params })
  },

  /** POST with a JSON body. */
  post(url, data = {}) {
    return pwaAxios.post(url, data)
  },

  /** PUT — full-resource update. */
  put(url, data = {}) {
    return pwaAxios.put(url, data)
  },

  /** PATCH — partial-resource update. */
  patch(url, data = {}) {
    return pwaAxios.patch(url, data)
  },

  /** DELETE. */
  delete(url) {
    return pwaAxios.delete(url)
  },

  /**
   * Multipart file upload. Pass a pre-built FormData instance.
   * Axios sets the multipart boundary automatically.
   */
  upload(url, formData) {
    return pwaAxios.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

/**
 * Connectivity-aware fetch wrapper (DEV_STANDARDS P8).
 *
 * Checks navigator.onLine before calling. If offline — or if the call fails
 * with a network error — fires the 'ayc:offline' custom event so the app
 * shell can show the offline screen, then returns the fallback value.
 *
 * Non-network errors (4xx, 5xx) are NOT caught here — they bubble to the
 * caller so journey code can handle them contextually.
 *
 * @template T
 * @param {() => Promise<T>} apiCall   Zero-arg function wrapping a pwaApiService call.
 * @param {T|null}           [fallback=null]  Returned when offline or network fails.
 * @returns {Promise<T|null>}
 */
export const safeFetch = async (apiCall, fallback = null) => {
  if (!navigator.onLine) {
    window.dispatchEvent(new CustomEvent('ayc:offline'))
    return fallback
  }
  try {
    return await apiCall()
  } catch (err) {
    if (err.code === 'ERR_NETWORK') {
      window.dispatchEvent(new CustomEvent('ayc:offline'))
    }
    throw err
  }
}

/**
 * Durable POST for guest-submitted forms (lead/loyalty/review/waiter-call/wifi —
 * DEV_STANDARDS "form" kind, never order placement; see syncEngine.js).
 *
 * Tries the network immediately. On a real connectivity failure (offline or
 * ERR_NETWORK — never on a 4xx/5xx, which the guest must see and correct) the
 * write is queued to the IndexedDB outbox and replayed in order once the
 * device reconnects (syncEngine.flushOutbox).
 *
 * Non-network errors (validation, server errors) bubble to the caller
 * unchanged — only a true network failure is queued.
 *
 * @param {string} url
 * @param {object} [data]
 * @param {{ sessionId?: string|null }} [options]
 * @returns {Promise<import('axios').AxiosResponse|{ queued: true, id: number }>}
 */
export const queuedPost = async (url, data = {}, { sessionId } = {}) => {
  if (navigator.onLine) {
    try {
      return await pwaAxios.post(url, data)
    } catch (err) {
      if (err.code !== 'ERR_NETWORK') throw err
      // fall through — queue below
    }
  } else {
    window.dispatchEvent(new CustomEvent('ayc:offline'))
  }

  const id = await addOutboxItem({
    kind: 'form',
    endpoint: url,
    payload: data,
    session_id: sessionId ?? data.session_id ?? null,
  })
  return { queued: true, id }
}
