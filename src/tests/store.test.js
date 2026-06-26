import { describe, it, expect } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'

import sessionReducer, {
  setSession, upgradeToEngaged, clearSession,
  selectSessionId, selectSessionType, selectScenario,
} from '../core/store/sessionSlice'

import venueConfigReducer, {
  setVenueConfig, clearVenueConfig,
  selectConfigLoaded, selectFeatures, selectReturnUrl, selectVenueTimeouts, selectVenueTheme,
} from '../core/store/venueConfigSlice'

import cartReducer, {
  addItem, removeItem, updateQuantity, setBasketId, clearCart,
  selectCartItems, selectBasketId, selectCartTotal, selectCartCount,
} from '../core/store/cartSlice'

const makeStore = () =>
  configureStore({
    reducer: {
      session:     sessionReducer,
      venueConfig: venueConfigReducer,
      cart:        cartReducer,
    },
  })

// ─── sessionSlice ─────────────────────────────────────────────────────────────

describe('sessionSlice', () => {
  it('has correct initial state', () => {
    const store = makeStore()
    const s = store.getState().session
    expect(s.sessionId).toBeNull()
    expect(s.sessionType).toBe('ambient')
    expect(s.scenario).toBeNull()
  })

  it('setSession merges payload into state', () => {
    const store = makeStore()
    store.dispatch(setSession({ sessionId: 'abc-123', venueId: '3', scenario: 'A' }))
    const s = store.getState().session
    expect(s.sessionId).toBe('abc-123')
    expect(s.venueId).toBe('3')
    expect(s.scenario).toBe('A')
    expect(s.sessionType).toBe('ambient') // untouched
  })

  it('upgradeToEngaged sets sessionType to engaged', () => {
    const store = makeStore()
    store.dispatch(upgradeToEngaged())
    expect(selectSessionType(store.getState())).toBe('engaged')
  })

  it('clearSession resets all fields to initial', () => {
    const store = makeStore()
    store.dispatch(setSession({ sessionId: 'xyz', scenario: 'B' }))
    store.dispatch(upgradeToEngaged())
    store.dispatch(clearSession())
    const s = store.getState().session
    expect(s.sessionId).toBeNull()
    expect(s.sessionType).toBe('ambient')
    expect(s.scenario).toBeNull()
  })

  it('selectors read from root state', () => {
    const store = makeStore()
    store.dispatch(setSession({ sessionId: 'sel-1', scenario: 'C' }))
    expect(selectSessionId(store.getState())).toBe('sel-1')
    expect(selectScenario(store.getState())).toBe('C')
  })
})

// ─── venueConfigSlice ─────────────────────────────────────────────────────────

describe('venueConfigSlice', () => {
  it('has correct initial state', () => {
    const store = makeStore()
    const v = store.getState().venueConfig
    expect(v.loaded).toBe(false)
    expect(v.scenario).toBeNull()
    expect(v.features.menu).toBe(false)
    expect(v.theme).toBeNull()
  })

  it('setVenueConfig stores the theme block', () => {
    const store = makeStore()
    store.dispatch(setVenueConfig({
      theme: { primary_color: '#E13437', heading_font: 'Poppins' },
    }))
    expect(selectVenueTheme(store.getState())).toEqual({
      primary_color: '#E13437', heading_font: 'Poppins',
    })
  })

  it('clearVenueConfig resets theme to null', () => {
    const store = makeStore()
    store.dispatch(setVenueConfig({ theme: { primary_color: '#E13437' } }))
    store.dispatch(clearVenueConfig())
    expect(selectVenueTheme(store.getState())).toBeNull()
  })

  it('setVenueConfig sets loaded = true and merges config', () => {
    const store = makeStore()
    store.dispatch(setVenueConfig({
      scenario:   'A',
      features:   { menu: true, wifi: true, lead: false, review: true, game: false },
      timeouts:   { wifi_display_ms: 60000 },
      return_url: 'https://pwa.ayc.ae/idle',
    }))
    const v = store.getState().venueConfig
    expect(v.loaded).toBe(true)
    expect(v.scenario).toBe('A')
    expect(v.features.menu).toBe(true)
    expect(v.features.lead).toBe(false)
    expect(v.return_url).toBe('https://pwa.ayc.ae/idle')
  })

  it('setVenueConfig merges partial features over defaults', () => {
    const store = makeStore()
    store.dispatch(setVenueConfig({ features: { menu: true } }))
    const f = store.getState().venueConfig.features
    expect(f.menu).toBe(true)
    expect(f.wifi).toBe(false)    // untouched default
    expect(f.game).toBe(false)
  })

  it('clearVenueConfig resets to initial state', () => {
    const store = makeStore()
    store.dispatch(setVenueConfig({ scenario: 'B', features: { wifi: true } }))
    store.dispatch(clearVenueConfig())
    expect(selectConfigLoaded(store.getState())).toBe(false)
    expect(selectFeatures(store.getState()).wifi).toBe(false)
  })

  it('selectors read from root state', () => {
    const store = makeStore()
    store.dispatch(setVenueConfig({
      return_url: 'https://return.url',
      timeouts:   { wifi_display_ms: 5000 },
    }))
    expect(selectReturnUrl(store.getState())).toBe('https://return.url')
    expect(selectVenueTimeouts(store.getState()).wifi_display_ms).toBe(5000)
  })
})

// ─── cartSlice ────────────────────────────────────────────────────────────────

describe('cartSlice', () => {
  const itemA = { id: 1, name: 'Burger', price: 25, modifiers: [] }
  const itemB = { id: 2, name: 'Fries',  price: 10, modifiers: [] }

  it('has correct initial state', () => {
    const store = makeStore()
    const c = store.getState().cart
    expect(c.items).toEqual([])
    expect(c.basketId).toBeNull()
  })

  it('addItem adds a new item with quantity 1 by default', () => {
    const store = makeStore()
    store.dispatch(addItem(itemA))
    expect(selectCartItems(store.getState())).toHaveLength(1)
    expect(selectCartItems(store.getState())[0].quantity).toBe(1)
  })

  it('addItem increments quantity for an existing item', () => {
    const store = makeStore()
    store.dispatch(addItem({ ...itemA, quantity: 1 }))
    store.dispatch(addItem({ ...itemA, quantity: 2 }))
    expect(selectCartItems(store.getState())[0].quantity).toBe(3)
    expect(selectCartItems(store.getState())).toHaveLength(1)
  })

  it('addItem keeps separate items with different ids', () => {
    const store = makeStore()
    store.dispatch(addItem(itemA))
    store.dispatch(addItem(itemB))
    expect(selectCartItems(store.getState())).toHaveLength(2)
  })

  it('removeItem removes the item by id', () => {
    const store = makeStore()
    store.dispatch(addItem(itemA))
    store.dispatch(addItem(itemB))
    store.dispatch(removeItem(1))
    expect(selectCartItems(store.getState())).toHaveLength(1)
    expect(selectCartItems(store.getState())[0].id).toBe(2)
  })

  it('updateQuantity sets a specific quantity', () => {
    const store = makeStore()
    store.dispatch(addItem(itemA))
    store.dispatch(updateQuantity({ itemId: 1, quantity: 5 }))
    expect(selectCartItems(store.getState())[0].quantity).toBe(5)
  })

  it('updateQuantity with quantity <= 0 removes the item', () => {
    const store = makeStore()
    store.dispatch(addItem(itemA))
    store.dispatch(updateQuantity({ itemId: 1, quantity: 0 }))
    expect(selectCartItems(store.getState())).toHaveLength(0)
  })

  it('setBasketId stores the KeyConnect basket reference', () => {
    const store = makeStore()
    store.dispatch(setBasketId('basket-xyz'))
    expect(selectBasketId(store.getState())).toBe('basket-xyz')
  })

  it('clearCart resets items and basketId', () => {
    const store = makeStore()
    store.dispatch(addItem(itemA))
    store.dispatch(setBasketId('basket-xyz'))
    store.dispatch(clearCart())
    expect(selectCartItems(store.getState())).toHaveLength(0)
    expect(selectBasketId(store.getState())).toBeNull()
  })

  it('selectCartTotal sums price × quantity for all items', () => {
    const store = makeStore()
    store.dispatch(addItem({ ...itemA, quantity: 2 })) // 25 × 2 = 50
    store.dispatch(addItem({ ...itemB, quantity: 3 })) // 10 × 3 = 30
    expect(selectCartTotal(store.getState())).toBe(80)
  })

  it('selectCartCount sums total quantity across all items', () => {
    const store = makeStore()
    store.dispatch(addItem({ ...itemA, quantity: 2 }))
    store.dispatch(addItem({ ...itemB, quantity: 3 }))
    expect(selectCartCount(store.getState())).toBe(5)
  })

  it('selectCartTotal is 0 for empty cart', () => {
    const store = makeStore()
    expect(selectCartTotal(store.getState())).toBe(0)
  })
})
