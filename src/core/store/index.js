import { configureStore } from '@reduxjs/toolkit'
import sessionReducer     from './sessionSlice'
import venueConfigReducer from './venueConfigSlice'
import cartReducer        from './cartSlice'

/**
 * Root Redux store for the AYC PWA.
 *
 * Slice map:
 *   session     → sessionSlice.js     — guest session ID, scenario, sessionType
 *   venueConfig → venueConfigSlice.js — runtime config from GET /pwa/config
 *   cart        → cartSlice.js        — in-session order items + KeyConnect basketId
 *
 * No localStorage persistence — shared kiosk device. All state is memory-only.
 */
const store = configureStore({
  reducer: {
    session:     sessionReducer,
    venueConfig: venueConfigReducer,
    cart:        cartReducer,
  },
})

/** @typedef {ReturnType<typeof store.getState>} RootState */
/** @typedef {typeof store.dispatch} AppDispatch */

export default store
