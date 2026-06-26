/**
 * Shared guest identity (first name, last name, mobile) reused across the
 * WiFi, Review, and Loyalty forms so a guest does not retype it in every
 * journey during one visit.
 *
 * This is an explicit, requested deviation from the project default of
 * keeping all guest data in Redux memory only (see sessionSlice.js) — the
 * tradeoff was discussed: a shared kiosk could leak one guest's PII to the
 * next guest if this localStorage entry ever survives past their session.
 * To guard against that, every read is scoped to the *current* session_id —
 * a profile saved under an older session_id is treated as stale and wiped
 * automatically, it is never returned to the caller.
 *
 * DO NOT use this for any other guest field. Anything beyond first/last
 * name + mobile belongs in Redux, per the existing rule.
 */

import { useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { selectSessionId } from '../store/sessionSlice'

const STORAGE_KEY = 'ayc_guest_profile'

// This product is UAE-only — '+971' is the fallback when no dial code matches.
const KNOWN_DIAL_CODES = ['+971', '+966', '+91', '+44', '+1']

/**
 * @typedef {Object} GuestProfile
 * @property {string} [first_name]
 * @property {string} [last_name]
 * @property {string} [mobile]      - full number, including country code
 * @property {string} session_id   - session this profile was captured under
 */

/**
 * Best-effort split of a combined "+971501234567" style number into its
 * dial code and local part, for forms with a separate country-code box.
 * @param {string} combined
 * @returns {{ countryCode: string, mobile: string }}
 */
export const splitMobile = (combined = '') => {
  const code = KNOWN_DIAL_CODES.find((c) => combined.startsWith(c))
  return code
    ? { countryCode: code, mobile: combined.slice(code.length) }
    : { countryCode: '+971', mobile: combined }
}

/**
 * Read the saved guest profile, but only if it belongs to the given session.
 * A profile from a stale (different) session is wiped and null is returned.
 * @param {string} sessionId
 * @returns {GuestProfile|null}
 */
export const getGuestProfile = (sessionId) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const profile = JSON.parse(raw)
    if (!sessionId || profile.session_id !== sessionId) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return profile
  } catch {
    return null
  }
}

/**
 * Merge new fields into the stored profile and (re)tag it with the current
 * session. Call after every successful form submit that captures identity.
 * @param {{ first_name?: string, last_name?: string, mobile?: string }} fields
 * @param {string} sessionId
 */
export const saveGuestProfile = (fields, sessionId) => {
  if (!sessionId) return
  const existing = getGuestProfile(sessionId) ?? {}
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...fields, session_id: sessionId }))
}

/**
 * Wipe the guest profile — wired to each form's "Clear" button.
 */
export const clearGuestProfile = () => {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * React hook giving form components read/save/clear access to the shared
 * guest profile, scoped to the active Redux session_id.
 *
 * `profile` is read straight from localStorage on every render (cheap,
 * synchronous) rather than cached in its own state — that way it updates
 * automatically when sessionId resolves/changes, with no effect required to
 * keep it in sync. `bump` only exists to force a re-render after save/clear,
 * since writing to localStorage does not itself trigger one.
 *
 * @returns {{ profile: GuestProfile|null, save: (fields: object) => void, clear: () => void }}
 */
export const useGuestProfile = () => {
  const sessionId = useSelector(selectSessionId)
  const [, bump] = useState(0)
  const profile = getGuestProfile(sessionId)

  const save = useCallback((fields) => {
    saveGuestProfile(fields, sessionId)
    bump((n) => n + 1)
  }, [sessionId])

  const clear = useCallback(() => {
    clearGuestProfile()
    bump((n) => n + 1)
  }, [])

  return { profile, save, clear }
}
