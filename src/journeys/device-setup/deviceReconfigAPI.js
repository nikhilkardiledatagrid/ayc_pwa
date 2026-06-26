/**
 * Device reconfiguration API — "change table" flow.
 *
 * Triggered by long-pressing the Menu tab in BottomNav. Operator enters the
 * global device password, then picks a different table for this device.
 *
 * Uses pwaAxios — device_token is already configured at this point.
 *
 * Backend endpoints:
 *   GET  /pwa/device/tables          (authenticated — all active tables for this venue)
 *   POST /pwa/device/verify-password (authenticated — global reconfig password)
 *   PUT  /pwa/device/table           (authenticated — replace device's table mapping)
 */

import pwaAxios from '../../core/api/pwaAxios'

/**
 * Fetch all active tables for the device's venue.
 *
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export const fetchVenueTables = async () => {
  const res = await pwaAxios.get('/pwa/device/tables')
  return res.data.data
}

/**
 * Verify the global device-reconfiguration password.
 *
 * @param {string} password
 * @returns {Promise<void>}
 * @throws {Error} with a user-facing message if the password is incorrect
 */
export const verifyDevicePassword = async (password) => {
  try {
    await pwaAxios.post('/pwa/device/verify-password', { password })
  } catch (err) {
    throw new Error(err.response?.data?.message ?? 'generic', { cause: err })
  }
}

/**
 * Replace this device's table assignment.
 *
 * @param {number} tableId
 * @returns {Promise<{ venue_id: number, venue_name: string, tables: Array<{id: number, name: string}> }>}
 * @throws {Error} with a user-facing message on failure
 */
export const updateDeviceTable = async (tableId) => {
  try {
    const res = await pwaAxios.put('/pwa/device/table', { table_id: tableId })
    return res.data.data
  } catch (err) {
    throw new Error(err.response?.data?.message ?? 'generic', { cause: err })
  }
}
