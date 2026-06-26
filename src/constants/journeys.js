/**
 * Journey key constants for the AYC PWA.
 *
 * MUST be the only source for journey identifiers — never hardcode
 * 'menu', 'wifi', etc. in journey or component code.
 *
 * Mirrors the backend TableNames.php convention for the PWA layer.
 */
export const JOURNEYS = Object.freeze({
  MENU:         'menu',
  WIFI:         'wifi',
  LEAD:         'lead',
  REVIEW:       'review',
  GAME:         'game',
  DASHBOARD:    'dashboard',
  WAITER:       'waiter',
  CART:         'cart',
  LOYALTY:      'loyalty',
  STATIC_MENU:  'static_menu',
  STORE_CLOSED: 'store-closed',
})
