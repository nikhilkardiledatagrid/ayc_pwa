/**
 * Device configuration persistence for the AYC PWA.
 *
 * Stores only device identity (device_token, device_id, qr_code) in localStorage.
 * This is DEVICE identity — not guest data and not venue/table config.
 * Approved by Rushiraj for persistent storage because this tablet is dedicated hardware.
 *
 * venue_id and tables[] are fetched fresh from backend on every app load via
 * GET /pwa/device/config — never stored here. This ensures admin changes to
 * venue/table assignment are picked up on every WebView reload.
 *
 * All guest-session data must remain in Redux memory only.
 */

const STORAGE_KEY = 'ayc_device_config'

/**
 * @typedef {Object} DeviceConfig
 * @property {string} device_token   - PWA auth token for pwaAxios (device_id.HMAC)
 * @property {number} device_id      - numeric ID of this device, extracted from device_token
 * @property {string} qr_code        - QR code used during pairing (e.g. "AYC-12345678")
 * @property {string} configured_at  - ISO 8601 timestamp
 */

/**
 * Read saved device config. Returns null if not configured.
 * @returns {DeviceConfig|null}
 */
export const getDeviceConfig = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Persist device identity after QR setup. Only stores identity — no venue/table data.
 * @param {{ device_token: string, qr_code: string }} config
 */
export const saveDeviceConfig = ({ device_token, qr_code }) => {
  // device_token format: "{device_id}.{HMAC}" — extract device_id from the prefix
  const device_id = parseInt(device_token.split('.')[0], 10) || null
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ device_token, device_id, qr_code, configured_at: new Date().toISOString() }),
  )
}

/**
 * Returns true if the device has been paired (device_token present).
 * @returns {boolean}
 */
export const isDeviceConfigured = () => {
  const cfg = getDeviceConfig()
  return !!(cfg?.device_token && cfg?.device_id)
}

/**
 * Wipe device config — used if device needs to be re-paired.
 */
export const clearDeviceConfig = () => {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Returns the numeric device ID from saved config.
 * @returns {number|null}
 */
export const getDeviceId = () => {
  const cfg = getDeviceConfig()
  return cfg?.device_id ?? null
}

// ── Session state (device-scoped, approved for localStorage) ─────────────────
// Stores session_id + started_at so the app can resume the same session
// within the 30-minute TTL without calling POST /pwa/session/start again.

const SESSION_KEY = 'ayc_session_state'

/**
 * @typedef {Object} SessionState
 * @property {string} session_id  UUID v4
 * @property {string} started_at  ISO 8601 timestamp
 */

/**
 * Read persisted session state. Returns null if not set.
 * @returns {SessionState|null}
 */
export const getSessionState = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Persist session state after a new session is created.
 * @param {{ session_id: string, started_at: string }} state
 */
export const saveSessionState = ({ session_id, started_at }) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ session_id, started_at }))
}

/**
 * Clear session state — called when a session is explicitly ended.
 */
export const clearSessionState = () => {
  localStorage.removeItem(SESSION_KEY)
}
