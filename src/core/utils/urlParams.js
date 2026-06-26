/**
 * Device URL param reader for the AYC PWA.
 *
 * READ ONLY — params are fixed for the device's lifetime.
 * Call getDeviceParams() ONCE on app load and store in Zustand.
 * Never re-read or mutate params mid-session.
 *
 * DO NOT regenerate this file. Contact Rushiraj if behaviour must change.
 */

/**
 * Read all device params from the current URL search string.
 * scenario defaults to 'C' when absent (safest fallback — no ordering).
 *
 * @returns {{ venue_id: string|null, screen_id: string|null, table: string|null, scenario: string }}
 */
export const getDeviceParams = () => {
  const params = new URLSearchParams(window.location.search)
  return {
    venue_id:  params.get('venue_id'),
    screen_id: params.get('screen_id'),
    table:     params.get('table'),
    scenario:  params.get('scenario') || 'C',
  }
}

/**
 * Validate that all required device params are present.
 * scenario is not required — it has a default.
 *
 * @param {{ venue_id: string|null, screen_id: string|null, table: string|null }} params
 * @returns {{ valid: boolean, missing: string[] }}
 */
export const validateDeviceParams = (params) => {
  const required = ['venue_id', 'screen_id', 'table']
  const missing = required.filter((key) => !params[key])
  return { valid: missing.length === 0, missing }
}
