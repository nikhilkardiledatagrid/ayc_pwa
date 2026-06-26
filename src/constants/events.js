/**
 * Event type constants for the AYC PWA.
 *
 * ALL values passed as event_type to logEvent() MUST come from here.
 * Never hardcode event type strings in journey or component code.
 */
export const EVENT_TYPES = Object.freeze({
  // Session
  SESSION_START:    'session_start',
  SESSION_UPGRADE:  'session_upgrade',
  SESSION_END:      'session_end',

  // Navigation
  CTA_TAPPED:       'cta_tapped',
  PAGE_VIEW:        'page_view',
  JOURNEY_START:    'journey_start',
  JOURNEY_COMPLETE: 'journey_complete',
  JOURNEY_TIMEOUT:  'journey_timeout',

  // Menu & ordering
  ITEM_VIEWED:      'item_viewed',
  ITEM_ADDED:       'item_added',
  CART_UPDATED:     'cart_updated',
  ORDER_PLACED:     'order_placed',
  ORDER_STATUS:     'order_status',

  // Guest value features
  WIFI_REQUESTED:   'wifi_requested',
  WIFI_QR_SHOWN:    'wifi_qr_shown',
  LEAD_SUBMITTED:   'lead_submitted',
  REVIEW_TAPPED:    'review_tapped',
  WAITER_CALLED:    'waiter_called',
  INVOICE_CALLED:   'invoice_called',
  WAITER_CALL_CANCELLED:  'waiter_call_cancelled',
  INVOICE_CALL_CANCELLED: 'invoice_call_cancelled',
  GAME_STARTED:     'game_started',
  GAME_COMPLETED:   'game_completed',

  // Dwell
  ITEM_DWELL:       'item_dwell',
  CATEGORY_DWELL:   'category_dwell',
  STEP_DWELL:       'step_dwell', // generic per-journey-step dwell (Wifi/Loyalty/Review state machines)
})
