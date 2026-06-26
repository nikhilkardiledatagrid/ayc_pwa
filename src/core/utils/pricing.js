/**
 * pricing — single place the PWA reads item pricing.
 *
 * The backend is the source of truth for whether a Limited Time Price applies:
 * the menu endpoint already computes `is_discount_active` (item availability ∩
 * discount schedule) and `effective_price`. The PWA NEVER re-evaluates the
 * schedule itself — it only displays what the backend resolved, and re-confirms
 * at checkout via POST /pwa/order/validate-pricing.
 */

/** True when the backend says a limited price is active for this item right now. */
export const isLimitedActive = (item) =>
  Boolean(item?.is_discount_active && item?.discounted_price != null)

/**
 * The per-unit base price to charge right now: the backend's effective_price
 * when present, else the discounted price (if active), else the normal price.
 */
export const effectiveUnitPrice = (item) => {
  if (item == null) return 0
  if (Number.isFinite(item.effective_price)) return Number(item.effective_price)
  if (isLimitedActive(item)) return Number(item.discounted_price)
  return Number(item.price ?? 0)
}

/** The original (pre-discount) per-unit price, for strike-through display. */
export const originalUnitPrice = (item) => Number(item?.price ?? 0)

/** Extract the options array from a modifier group across the shapes the API uses. */
const groupOptions = (g) =>
  Array.isArray(g?.options) ? g.options
    : Array.isArray(g?.variants) ? g.variants
      : Array.isArray(g?.items) ? g.items : []

/** The Base Price Group on an item, if any. */
const baseGroupOf = (item) => (item?.variant_groups || []).find((g) => g.is_base_price_group) || null

/**
 * A Base Price Group option's price after the item's active limited discount.
 *
 * The discount is applied exactly as it was configured — independently:
 *   - `price`      → a FIXED amount is subtracted from every base price.
 *   - `percentage` → that percentage is taken off every base price.
 *
 * Returns the original unchanged when no discount is active.
 */
export const discountedBaseOption = (item, price) => {
  const p = Number(price) || 0
  if (!isLimitedActive(item)) return p

  if (item.discount_type === 'price') {
    const off = Number.isFinite(item.amount_saved)
      ? Number(item.amount_saved)
      : Math.max(0, (Number(item.price) || 0) - (Number(item.discounted_price) || 0))
    return Math.max(0, Math.round((p - off) * 100) / 100)
  }

  const pct = Number(item.discount_percentage) || 0
  return pct > 0 ? Math.round(p * (1 - pct / 100) * 100) / 100 : p
}

/**
 * The price to DISPLAY for an item before any selection: the lowest option in
 * its Base Price Group when it has one, otherwise the item's own price.
 */
export const displayPrice = (item) => {
  const bg = baseGroupOf(item)
  if (bg) {
    const prices = groupOptions(bg).map((o) => Number(o.price) || 0)
    if (prices.length) return Math.min(...prices)
  }
  return Number(item?.price) || 0
}

/**
 * Resolve an item's per-unit pricing for the current selections.
 *
 * A variant group flagged `is_base_price_group` defines the base price: each of
 * its options is its OWN absolute price (Small 100, Medium 120, Large 130) and
 * selecting one sets the base. Every other variant group and all add-ons are
 * ADDITIVE on top of that base. When no Base Price Group exists, the item's own
 * price is the base.
 *
 * Limited Time Pricing applies (as a percentage) to the resolved base; modifiers
 * are never discounted.
 *
 * @returns {{ base: number, originalBase: number, extras: number }}
 *   base = per-unit base after any limited discount; originalBase = pre-discount
 *   base (for strike-through); extras = additive modifiers.
 */
export const resolveItemPricing = (item, selections = {}, variants = [], addons = []) => {
  let rawBase = Number(item?.price) || 0
  let extras = 0
  let hasBaseGroup = false

  variants.forEach((g) => {
    const opts = groupOptions(g)
    const selected = selections[`variant_${g.id}`] || []
    if (g.is_base_price_group) {
      // The selected option's price IS the base. Before a selection is made we
      // show the lowest option (the displayed "from" price).
      hasBaseGroup = true
      const selectedOpt = opts.find((o) => selected.includes(o.id))
      const rawBaseVal = selectedOpt
        ? (Number(selectedOpt.price) || 0)
        : Math.min(...opts.map((o) => Number(o.price) || 0))
      if (Number.isFinite(rawBaseVal)) rawBase = rawBaseVal
    } else {
      selected.forEach((id) => {
        const o = opts.find((x) => x.id === id)
        if (o) extras += Number(o.price) || 0
      })
    }
  })

  addons.forEach((g) => {
    const opts = groupOptions(g)
    ;(selections[`addon_${g.id}`] || []).forEach((id) => {
      const o = opts.find((x) => x.id === id)
      if (o) extras += Number(o.price) || 0
    })
  })

  const originalBase = rawBase
  let base
  if (!hasBaseGroup) {
    // No base group → backend-resolved effective price (handles % + absolute discounts).
    base = effectiveUnitPrice(item)
  } else {
    // Base group → apply the limited discount to the selected base price exactly
    // as configured (fixed amount or percentage). Keeps the total in sync with
    // the per-option prices shown in the UI.
    base = discountedBaseOption(item, rawBase)
  }

  return { base, originalBase, extras }
}

/** Format a numeric price for display, e.g. "8.80 AED". */
export const formatPrice = (price, currency = 'AED') => {
  const value = Number.isFinite(price) ? price : 0
  return `${value.toFixed(2)} ${currency || 'AED'}`
}
