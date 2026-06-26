/**
 * Journey timeout manager for the AYC PWA.
 *
 * ALL timeout durations MUST come from the venue config returned by GET /pwa/config.
 * TIMEOUT_DEFAULTS are fallback values only — never hardcode durations in journey code.
 *
 * Usage:
 *   1. On app load, call configureTimeouts(venueConfig.timeouts) once.
 *   2. In each journey, call startTimeout(key, callback) to arm a timer.
 *   3. On journey end (or returnToIdle), call stopAllTimeouts().
 *
 * DO NOT regenerate this file. Contact Rushiraj if behaviour must change.
 */

/** Fallback durations — always overridden by values from GET /pwa/config */
export const TIMEOUT_DEFAULTS = {
  session_idle_ms:      30 * 60 * 1000,  // 30 min  — session close; overridden by venue session_ttl_ms from GET /pwa/session/config
  wifi_display_ms:           60 * 1000,  // 60 sec  — clear WiFi screen
  order_status_ms:      10 * 60 * 1000,  // 10 min  — abandon order status
  game_session_ms:       3 * 60 * 1000,  // 3 min   — game timeout
  lead_form_ms:          5 * 60 * 1000,  // 5 min   — lead form timeout
  post_order_return_ms:      30 * 1000,  // 30 sec  — after "ready" shown
}

let activeConfig = { ...TIMEOUT_DEFAULTS }
const timers     = new Map()

/**
 * Load timeout durations from the venue config.
 * Call once after GET /pwa/config resolves. Backend values take precedence.
 *
 * @param {Partial<typeof TIMEOUT_DEFAULTS>} venueTimeouts  timeouts object from /pwa/config
 */
export const configureTimeouts = (venueTimeouts = {}) => {
  activeConfig = { ...TIMEOUT_DEFAULTS, ...venueTimeouts }
}

/**
 * Start a named journey timeout. If a timer with the same key is already
 * running it is replaced — no double-firing.
 *
 * @param {string}   key       One of the TIMEOUT_DEFAULTS keys
 * @param {Function} callback  Called when the timeout fires
 */
export const startTimeout = (key, callback) => {
  stopTimeout(key) // replace any existing timer for this key
  const ms = activeConfig[key]
  if (!ms) return
  timers.set(key, setTimeout(callback, ms))
}

/**
 * Cancel a single named timeout. Safe to call even if the timer is not running.
 *
 * @param {string} key
 */
export const stopTimeout = (key) => {
  if (timers.has(key)) {
    clearTimeout(timers.get(key))
    timers.delete(key)
  }
}

/** Cancel every active timeout. Call on session end, returnToIdle, and journey changes. */
export const stopAllTimeouts = () => {
  for (const key of timers.keys()) {
    clearTimeout(timers.get(key))
  }
  timers.clear()
}

/**
 * Return the configured duration for a key (defaults + any venue override).
 * Useful for displaying countdown UIs.
 *
 * @param {string} key
 * @returns {number|undefined}
 */
export const getTimeoutMs = (key) => activeConfig[key]

/** Reset to defaults and clear all timers. Call between sessions or in tests. */
export const resetTimeoutManager = () => {
  stopAllTimeouts()
  activeConfig = { ...TIMEOUT_DEFAULTS }
}
