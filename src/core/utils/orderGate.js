import { pwaApiService, safeFetch } from '../api/pwaApiService'

/**
 * Add-to-cart availability gate.
 *
 * Before an item enters the cart we ask the backend whether it is orderable right
 * now. The backend decides this from the exact same live-menu build that GET
 * /pwa/menu returns (menu hours → category window → item availability → item time
 * window → discount clock), so an item whose window has just closed can never be
 * added — even when the client's cached menu is stale and was never refreshed.
 *
 * Fail-open policy: if the gate cannot be reached (offline / network / unexpected
 * error) we allow the add and let the checkout re-pricing call act as the hard
 * backstop. This keeps the kiosk usable during a transient backend hiccup while
 * still gaining time-window protection in the normal case.
 *
 * @param {number|string} itemId  The menu item id the guest tapped "Add" on.
 * @returns {Promise<{ available: boolean, item: object|null, reason: string }>}
 */
export const checkItemAvailable = async (itemId) => {
  try {
    // `null` fallback means offline → fail open (let checkout catch it).
    const res = await safeFetch(
      () => pwaApiService.post('/pwa/order/validate-item', { id: itemId }),
      null,
    )

    if (!res) {
      return { available: true, item: null, reason: 'gate_offline' }
    }

    const data = res?.data?.data ?? {}
    return {
      available: data.available === true,
      item: data.item ?? null,
      reason: data.available === true ? 'ok' : 'unavailable',
    }
  } catch {
    // 4xx/5xx — fail open; checkout/validate-pricing is the hard gate.
    return { available: true, item: null, reason: 'gate_error' }
  }
}
