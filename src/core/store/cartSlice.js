import { createSlice } from '@reduxjs/toolkit'

/**
 * Cart slice — in-session guest order state.
 *
 * basketId is the KeyConnect basket reference created on the backend
 * when the first item is added (POST /pwa/order/basket).
 *
 * NEVER persist to localStorage — shared kiosk device.
 * Always call clearCart() on journey end / returnToIdle.
 */
const initialState = {
  basketId: null,    // KeyConnect basket ID — set after backend basket creation
  items:    [],      // [{ id, name, price, quantity, modifiers: [] }]
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    setBasketId(state, action) {
      state.basketId = action.payload ?? null
    },

    addItem(state, action) {
      const incoming = action.payload
      const existing = state.items.find((i) => i.id === incoming.id)
      if (existing) {
        existing.quantity += incoming.quantity ?? 1
        if (incoming.image_url && !existing.image_url) {
          existing.image_url = incoming.image_url
        }
      } else {
        state.items.push({ ...incoming, quantity: incoming.quantity ?? 1 })
      }
    },

    removeItem(state, action) {
      state.items = state.items.filter((i) => i.id !== action.payload)
    },

    updateQuantity(state, action) {
      const { itemId, quantity } = action.payload
      if (quantity <= 0) {
        state.items = state.items.filter((i) => i.id !== itemId)
      } else {
        const item = state.items.find((i) => i.id === itemId)
        if (item) item.quantity = quantity
      }
    },

    /**
     * Apply server-validated pricing (from POST /pwa/order/validate-pricing).
     * `lines` mirror state.items by index — the backend re-prices each line and
     * is the source of truth, so a stale/expired Limited Time Price is corrected
     * here before checkout. Unavailable lines are flagged for the UI to surface.
     */
    repriceItems(state, action) {
      const lines = action.payload?.lines ?? []
      lines.forEach((line, index) => {
        const item = state.items[index]
        if (!item) return
        if (line.available === false) {
          item.unavailable = true
          return
        }
        item.unavailable = false
        item.isLimited = Boolean(line.is_discount_active)
        if (Number.isFinite(line.current_base_price)) item.basePrice = line.current_base_price
        if (Number.isFinite(line.unit_price)) item.price = line.unit_price
      })
    },

    clearCart(state) {
      Object.assign(state, initialState)
    },
  },
})

export const {
  setBasketId,
  addItem,
  removeItem,
  updateQuantity,
  repriceItems,
  clearCart,
} = cartSlice.actions

export const selectCart      = (state) => state.cart
export const selectCartItems = (state) => state.cart.items
export const selectBasketId  = (state) => state.cart.basketId
export const selectCartTotal = (state) =>
  state.cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
export const selectCartCount = (state) =>
  state.cart.items.reduce((sum, item) => sum + item.quantity, 0)

export default cartSlice.reducer
