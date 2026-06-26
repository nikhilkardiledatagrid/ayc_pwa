import { logEvent } from './eventQueue'
import { endSessionGlobally } from './sessionManager'
import { EVENT_TYPES } from '../../constants/events'

/**
 * Signal OptiSigns to return the tablet to its idle/ad state.
 *
 * MANDATORY — call at the end of EVERY journey without exception:
 *   journey timeout · order complete · form submit · game end · inactivity
 *
 * When sessionId is provided, this also ends the guest session first:
 *   1. endSessionGlobally() — closes the session row (sendBeacon) and tells
 *      the backend to notify OptiSigns the session ended
 *   2. logEvent(SESSION_END) — so analytics has a clean session boundary
 * Then, regardless of sessionId:
 *   3. postMessage to OptiSigns parent WebView (primary)
 *   4. Navigate to return_url from venue config (fallback when no parent frame)
 *
 * DO NOT remove or skip this call. Contact Rushiraj if behaviour must change.
 */

/**
 * @param {{ return_url?: string } | undefined} config  Venue config from /pwa/config
 * @param {string} [sessionId]  Active session id — omit if no session is live yet
 * @param {'journey_complete'|'timeout'|'operating_hours'} [reason]
 */
export const returnToIdle = (config, sessionId, reason = 'timeout') => {
  if (sessionId) {
    endSessionGlobally(sessionId, reason)
    logEvent({ event_type: EVENT_TYPES.SESSION_END, session_id: sessionId, reason })
  }
  if (window.parent !== window) {
    // Origin is '*' — OptiSigns WebView origin is not fixed and varies per deployment
    window.parent.postMessage({ type: 'ayc_return_idle' }, '*')
  }
  if (config?.return_url) {
    window.location.href = config.return_url
  }
}
