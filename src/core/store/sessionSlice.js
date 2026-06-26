import { createSlice } from '@reduxjs/toolkit'
import { getDeviceId, getSessionState } from '../utils/deviceConfig'

/**
 * Session slice — tracks the active guest session on the device.
 *
 * sessionType lifecycle:
 *   'ambient'  → screen is idle, no guest interaction
 *   'engaged'  → guest has touched the screen (call upgradeToEngaged once)
 *
 * NEVER persist guest-session data (table, scenario, sessionType, venueId) to
 * localStorage — this is a shared kiosk device. That data lives in Redux
 * memory only and is cleared on journey end.
 *
 * sessionId and screenId are seeded from the already-approved device-scoped
 * localStorage (ayc_device_config / ayc_session_state — see deviceConfig.js)
 * so they're available synchronously on first render, before the async
 * fetchDeviceConfig()/initSession() chain in App.jsx resolves. App.jsx still
 * dispatches setSession() with fresh values once that chain completes (e.g.
 * a brand-new session_id, or a screen/table reassignment).
 */
const initialState = {
  sessionId:   getSessionState()?.session_id ?? null,  // resumed session id, if any
  venueId:     null,
  screenId:    getDeviceId(),                           // device identity — known immediately
  table:       null,
  scenario:    null,   // 'A' | 'B' | 'C'
  sessionType: 'ambient',
}

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setSession(state, action) {
      Object.assign(state, action.payload)
    },
    upgradeToEngaged(state) {
      state.sessionType = 'engaged'
    },
    clearSession(state) {
      // Re-read localStorage at clear time — endSession() wipes ayc_session_state
      // before this runs, so sessionId resolves to null (not the stale load-time value).
      Object.assign(state, {
        sessionId:   getSessionState()?.session_id ?? null,
        venueId:     null,
        screenId:    getDeviceId(),
        table:       null,
        scenario:    null,
        sessionType: 'ambient',
      })
    },
  },
})

export const { setSession, upgradeToEngaged, clearSession } = sessionSlice.actions

export const selectSession     = (state) => state.session
export const selectSessionId   = (state) => state.session.sessionId
export const selectScreenId    = (state) => state.session.screenId
export const selectSessionType = (state) => state.session.sessionType
export const selectScenario    = (state) => state.session.scenario

export default sessionSlice.reducer
