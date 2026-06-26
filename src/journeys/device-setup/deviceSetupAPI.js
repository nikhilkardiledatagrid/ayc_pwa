/**
 * Device setup API — used ONLY during initial device pairing.
 *
 * Uses raw fetch (not pwaAxios) because the device_token is not yet available
 * at this point. This is the one place in the PWA where unauthenticated calls
 * are intentional.
 *
 * Backend endpoints required:
 *   GET  /pwa/device/setup/{qr_code}   (public — no device_token needed)
 *   POST /pwa/device/setup/confirm     (public — no device_token needed)
 *   GET  /pwa/device/config            (authenticated — requires device_token)
 */

import pwaAxios from '../../core/api/pwaAxios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const APP_TOKEN = import.meta.env.VITE_API_STATIC_TOKEN

/**
 * Look up a device by QR code and return its venue + available tables.
 *
 * If the device is already mapped to a table, `current_table_id` is set so
 * the setup screen can pre-select that table — the operator can re-confirm
 * the same table or pick a different one.
 *
 * @param {string} qrCode  e.g. "AYC-12345678"
 * @returns {Promise<{ device_token: string, venue_id: number, venue_name: string, current_table_id: number|null, tables: Array<{id: number, name: string}> }>}
 * @throws {Error} with a user-facing message on 404 / network failure
 */
export const lookupDeviceByQr = async (qrCode) => {
  let res
  try {
    res = await fetch(
      `${BASE_URL}/pwa/device/setup/${encodeURIComponent(qrCode.trim())}`,
      { headers: { Accept: 'application/json', 'X-App-Token': APP_TOKEN } },
    )
  } catch {
    throw new Error('network')
  }

  const body = await res.json().catch(() => ({}))

  if (res.status === 404) throw new Error('qr_not_found')
  if (res.status === 422) throw new Error(body.message ?? 'generic')
  if (!res.ok)            throw new Error(body.message ?? 'generic')

  return body.data
}

/**
 * Confirm device-to-table mapping (Step 2 of setup).
 *
 * Each device maps to one table. Multiple devices can share the same table.
 * Call this BEFORE saveDeviceConfig().
 *
 * @param {string} qrCode   The QR code entered in Step 1.
 * @param {number} tableId  The table ID the operator selected.
 * @returns {Promise<void>}
 * @throws {Error} with a user-facing message on failure
 */
export const confirmDeviceSetup = async (qrCode, tableId) => {
  let res
  try {
    res = await fetch(`${BASE_URL}/pwa/device/setup/confirm`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-App-Token': APP_TOKEN },
      body:    JSON.stringify({ qr_code: qrCode.trim(), table_id: tableId }),
    })
  } catch {
    throw new Error('network')
  }

  const body = await res.json().catch(() => ({}))

  if (!res.ok) throw new Error(body.message ?? 'Failed to confirm device setup.')
}

/**
 * Fetch fresh device config from backend on every app load.
 * Uses pwaAxios (requires device_token in localStorage).
 *
 * @returns {Promise<{ venue_id: number, venue_name: string, venue_logo_url: string|null, tables: Array<{id: number, name: string}>, is_ordering_enabled: boolean, theme: object }>}
 */
export const fetchDeviceConfig = async () => {
  const res = await pwaAxios.get('/pwa/device/config')
  return res.data.data
}

/**
 * Fetch the venue-specific session resume TTL from the backend.
 * Returns the value the venue admin configured in the ERP.
 * Falls back to null if the request fails — sessionManager uses 30 min default.
 *
 * @returns {Promise<number|null>}  session_ttl_ms or null on failure
 */
export const fetchSessionConfig = async () => {
  try {
    const res = await pwaAxios.get('/pwa/session/config')
    return res.data.data?.session_ttl_ms ?? null
  } catch {
    return null  // non-fatal — sessionManager falls back to 30 min default
  }
}
