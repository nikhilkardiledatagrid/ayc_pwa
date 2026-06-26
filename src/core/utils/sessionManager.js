/**
 * Session lifecycle manager for the AYC PWA.
 *
 * Dynamic resume TTL rule:
 *   On every app load, initSession() checks localStorage for a live session.
 *   If one exists and is within the venue's session_ttl_ms window, it is reused — no API call.
 *   Once expired (or absent), a new UUID is generated and POST /pwa/session/start
 *   is called to create a fresh row in pwa_sessions.
 *
 *   session_ttl_ms comes from the backend (GET /pwa/session/config) per venue.
 *   If the backend does not send it, SESSION_TTL_DEFAULT_MS (30 min) is used.
 *
 * All session state lives in Redux (sessionSlice) during the page lifecycle.
 * Only the session_id and started_at are persisted in localStorage (device-scoped,
 * approved by Rushiraj — same reason as device_token storage).
 *
 * DO NOT regenerate this file. Contact Rushiraj if behaviour must change.
 */

import pwaAxios from '../api/pwaAxios'
import { getDeviceConfig, getSessionState, saveSessionState, clearSessionState } from './deviceConfig'
import { logEvent } from './eventQueue'
import { EVENT_TYPES } from '../../constants/events'

const SESSION_TTL_DEFAULT_MS = 30 * 60 * 1000 // 30 minutes — fallback when venue does not set one

// Pending promise guard — prevents double POST /pwa/session/start when App.jsx
// and HomeScreen.jsx both call initSession/createSession before the first resolves.
let _pendingInit = null

/**
 * Initialize the session on app load.
 *
 * If a session started within the venue's session_ttl_ms window is found in
 * localStorage, it is reused (no API call, no SESSION_START event — it is
 * not a new session). Otherwise a new session is created and a
 * SESSION_START event is logged, mirroring returnToIdle()'s SESSION_END.
 *
 * Concurrent calls share the same in-flight promise — only one POST fires.
 *
 * @param {{ table_name: string, scenario?: string, sessionTtlMs?: number }} params
 * @returns {Promise<string>}  UUID v4 session ID (new or resumed).
 */
export const initSession = ({ table_name, scenario = 'C', sessionTtlMs }) => {
  if (_pendingInit) return _pendingInit

  _pendingInit = (async () => {
    const ttl    = sessionTtlMs ?? SESSION_TTL_DEFAULT_MS
    const stored = getSessionState()

    if (stored?.session_id && stored?.started_at) {
      const ageMs = Date.now() - new Date(stored.started_at).getTime()
      if (ageMs < ttl) return stored.session_id  // resume — skip API call
    }

    const sessionId = crypto.randomUUID()
    await pwaAxios.post('/pwa/session/start', {
      session_id: sessionId,
      table_name,
      scenario,
    })

    saveSessionState({ session_id: sessionId, started_at: new Date().toISOString() })
    logEvent({ event_type: EVENT_TYPES.SESSION_START, session_id: sessionId })
    return sessionId
  })().finally(() => { _pendingInit = null })

  return _pendingInit
}

/**
 * Upgrade ambient → engaged on first guest touch.
 * Guard the call with a Redux flag (upgradeToEngaged) so it fires only once.
 *
 * @param {string} sessionId
 */
/**
 * Backward-compat alias used by HomeScreen.jsx (first-touch session create).
 * Accepts the old URL-params shape { venue_id, screen_id, table, scenario }.
 * Internally calls initSession() so the resume-TTL check is applied.
 *
 * @param {{ table?: string, scenario?: string, sessionTtlMs?: number }} params
 * @returns {Promise<string>}
 */
export const createSession = ({ table, scenario, sessionTtlMs } = {}) =>
  initSession({ table_name: table ?? '', scenario, sessionTtlMs })

export const upgradeSession = async (sessionId) => {
  await pwaAxios.put('/pwa/session/upgrade', { session_id: sessionId })
}

/**
 * Close the session.
 * Uses sendBeacon — guaranteed delivery even when the page is hidden or unloading.
 * Never use fetch/axios here — the browser may cancel it on visibility change.
 *
 * device_token is passed as a query param because sendBeacon cannot set headers.
 *
 * @param {string} sessionId
 * @param {'journey_complete'|'timeout'|'operating_hours'} [reason]
 */
export const endSession = (sessionId, reason = 'journey_complete') => {
  const token    = getDeviceConfig()?.device_token
  const appToken = import.meta.env.VITE_API_STATIC_TOKEN
  const base     = import.meta.env.VITE_API_BASE_URL

  const params = new URLSearchParams({ app_token: appToken })
  if (token) params.set('device_token', token)

  const url = `${base}/pwa/session/end?${params.toString()}`

  navigator.sendBeacon(
    url,
    new Blob([JSON.stringify({ session_id: sessionId, end_reason: reason })], { type: 'application/json' }),
  )
  clearSessionState()
}

/**
 * End the session AND notify the backend so it can tell OptiSigns the
 * session ended (POST /pwa/session/optisigns-end).
 *
 * Sends the device's identity from localStorage (device_id, qr_code) along
 * with the session_id, since this is a public endpoint with no device token
 * to resolve the device from.
 *
 * Call this from anywhere in the PWA — journeys, timeoutManager, eventQueue,
 * etc. — whenever the guest session must be terminated.
 *
 * @param {string} sessionId
 * @param {'journey_complete'|'timeout'|'operating_hours'} [reason]
 */
export const endSessionGlobally = (sessionId, reason = 'timeout') => {
  endSession(sessionId, reason)

  const deviceConfig = getDeviceConfig()
  pwaAxios.post('/pwa/session/optisigns-end', {
    session_id: sessionId,
    device_id:  deviceConfig?.device_id ?? null,
    qr_code:    deviceConfig?.qr_code ?? null,
  }).catch(() => {})
}

/**
 * Restart the guest session after the shared profile (name/mobile — see
 * guestProfile.js) is cleared on the WiFi, Review, or Loyalty form.
 *
 * A guest who clears a wrongly-resumed profile is, by definition, not the
 * guest the current session belongs to — so the session identity is rotated
 * too, not just the form fields.
 *
 * Deliberately uses endSession() (sendBeacon close only), NEVER
 * endSessionGlobally() — the guest is still mid-journey, not idling out, so
 * OptiSigns must not be notified/asked to change the on-screen asset.
 *
 * @param  {string|null} oldSessionId
 * @param  {{ table?: string, scenario?: string, sessionTtlMs?: number }} params
 * @return {Promise<string>} the new session id
 */
export const restartSession = async (oldSessionId, { table, scenario, sessionTtlMs } = {}) => {
  if (oldSessionId) {
    endSession(oldSessionId, 'profile_cleared')
    logEvent({ event_type: EVENT_TYPES.SESSION_END, session_id: oldSessionId, reason: 'profile_cleared' })
  }

  // initSession() always creates a genuinely new session here (clearSessionState()
  // above just wiped localStorage) and logs SESSION_START itself.
  const newSessionId = await initSession({ table_name: table ?? '', scenario, sessionTtlMs })
  return newSessionId
}
