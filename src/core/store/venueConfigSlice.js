import { createSlice } from '@reduxjs/toolkit'

/**
 * venueConfig slice — holds the runtime config returned by GET /pwa/config.
 *
 * Loaded once on app start, then read-only for the session.
 * Drives: which CTAs appear, journey timeouts, branding, return_url for returnToIdle.
 *
 * NEVER persist to localStorage — shared kiosk device.
 */
const initialState = {
  loaded:   false,
  scenario: null,         // 'A' | 'B' | 'C'  (also in session; kept here for config consumers)
  venue_id:   null,       // fetched fresh from GET /pwa/device/config on every load
  venue_name: null,
  logo_url:   null,       // from venue.logo_url — used by IdleScreen + StoreClosedScreen
  is_ordering_enabled: true, // computed from operating_hours in Asia/Dubai tz on backend
  tables:     [],         // Array<{ id: number, name: string }> — all tables for this device
  features: {
    menu:      false,
    wifi:      false,
    lead:      false,
    review:    false,
    game:      false,
    dashboard: false,
    waiter:    false,
  },
  journey_config:  null,  // { wifi, review, loyalty } booleans — whether each journey's
                          //   underlying data is configured. null until config loads.
                          //   Drives the "not configured yet" states inside journey screens.
                          //   loyalty_benefits (string|null) rides alongside loyalty — optional
                          //   marketing copy from the Form Builder, shown above the lead form.
  pwa_features: {         // Admin master switches from Venue → PWA Settings. When a flag is
    menu:        true,    //   false the matching CTA is hidden entirely. Defaults all-true so
    call_server: true,    //   venues with no settings row (and the DEV MOCK) behave unchanged.
    wifi:        true,
    rating:      true,
    loyalty:     true,
  },
  branding:        null,  // { logo_url, primary_color, ... }
  theme:           null,  // { primary_color, secondary_color, heading_color, text_color,
                          //   background_color, heading_font, heading_font_size, text_font,
                          //   text_font_size } — each null when the venue hasn't set it.
                          //   Applied to CSS vars via applyVenueTheme() in App.jsx.
  timeouts:        null,  // matches TIMEOUT_DEFAULTS keys — passed to configureTimeouts()
  return_url:      null,  // passed to returnToIdle()
  session_ttl_ms:  null,  // venue-specific session resume TTL — null falls back to 30 min default
  menu_source:     null,  // menu envelope source: 'custom_menu_builder' | 'keyconnect' | … —
                          // AYC Menu Builder menus are view-only (no order placement).
  no_table_assigned: false, // true when GET /pwa/device/config returns an empty tables[] —
                            // device has no table mapped yet. Set explicitly from App.jsx's
                            // load effect (not from setVenueConfig) so it can't be derived
                            // from the DEV MOCK's missing `tables` field.
}

const venueConfigSlice = createSlice({
  name: 'venueConfig',
  initialState,
  reducers: {
    setVenueConfig(state, action) {
      const cfg = action.payload ?? {}
      state.loaded     = true
      state.scenario   = cfg.scenario   ?? null
      state.venue_id   = cfg.venue_id   ?? null
      state.venue_name = cfg.venue_name ?? null
      // venue_logo_url comes from real backend; logo_url from DEV MOCK branding — prefer real
      state.logo_url   = cfg.venue_logo_url ?? cfg.branding?.logo_url ?? null
      state.is_ordering_enabled = cfg.is_ordering_enabled ?? true
      state.tables     = cfg.tables     ?? []
      state.features   = { ...initialState.features, ...(cfg.features ?? {}) }
      state.journey_config = cfg.journey_config ?? null
      state.pwa_features   = { ...initialState.pwa_features, ...(cfg.pwa_features ?? {}) }
      state.branding       = cfg.branding       ?? null
      state.theme          = cfg.theme          ?? null
      state.timeouts       = cfg.timeouts       ?? null
      state.return_url     = cfg.return_url     ?? null
      state.session_ttl_ms = cfg.session_ttl_ms ?? null
    },
    clearVenueConfig(state) {
      Object.assign(state, initialState)
    },
    setDeviceTables(state, action) {
      state.tables = action.payload ?? []
    },
    setMenuSource(state, action) {
      state.menu_source = action.payload ?? null
    },
    setNoTableAssigned(state, action) {
      state.no_table_assigned = !!action.payload
    },
  },
})

export const { setVenueConfig, clearVenueConfig, setDeviceTables, setMenuSource, setNoTableAssigned } = venueConfigSlice.actions

export const selectVenueConfig        = (state) => state.venueConfig
export const selectFeatures           = (state) => state.venueConfig.features
export const selectJourneyConfig      = (state) => state.venueConfig.journey_config
export const selectPwaFeatures        = (state) => state.venueConfig.pwa_features
export const selectVenueTheme         = (state) => state.venueConfig.theme
export const selectVenueTimeouts      = (state) => state.venueConfig.timeouts
export const selectReturnUrl          = (state) => state.venueConfig.return_url
export const selectConfigLoaded       = (state) => state.venueConfig.loaded
export const selectVenueId            = (state) => state.venueConfig.venue_id
export const selectVenueName          = (state) => state.venueConfig.venue_name
export const selectLogoUrl            = (state) => state.venueConfig.logo_url
export const selectIsOrderingEnabled  = (state) => state.venueConfig.is_ordering_enabled
export const selectDeviceTables       = (state) => state.venueConfig.tables
export const selectSessionTtlMs       = (state) => state.venueConfig.session_ttl_ms
export const selectMenuSource         = (state) => state.venueConfig.menu_source
export const selectNoTableAssigned    = (state) => state.venueConfig.no_table_assigned
/** AYC Menu Builder menus are view-only; any third-party (KeyConnect) is orderable. */
export const selectCanPlaceOrder      = (state) => state.venueConfig.menu_source !== 'custom_menu_builder'

export default venueConfigSlice.reducer
