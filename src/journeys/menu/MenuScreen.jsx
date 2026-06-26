import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import aycLogo from '../../assets/ayc-logo.png'
import bgImage from '../../assets/pwa-bg.png'
import { useSelector, useDispatch } from 'react-redux'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination, Zoom, Keyboard } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'
import 'swiper/css/zoom'
import { ArrowRight, ArrowLeft, ShoppingBag, Plus, Minus, X, AlertTriangle, Sliders } from 'lucide-react'
import { useTranslation } from '../../i18n/index'
import { addItem, updateQuantity, selectCartItems, selectCartCount, selectCartTotal } from '../../core/store/cartSlice'
import { CartSummaryBar, CartModal } from './CartComponents'
import FloatingWaiterCall from '../../components/layout/FloatingWaiterCall'
import { pwaApiService } from '../../core/api/pwaApiService'
import { checkItemAvailable } from '../../core/utils/orderGate'
import { cacheAndFetch } from '../../core/utils/offlineCache'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectReturnUrl, selectVenueConfig, selectLogoUrl, selectVenueName, selectNoTableAssigned, setMenuSource } from '../../core/store/venueConfigSlice'
import { selectSessionId, selectSession } from '../../core/store/sessionSlice'
import { resolveItemPricing, displayPrice, discountedBaseOption, isLimitedActive } from '../../core/utils/pricing'
import { renderSafeOfferHtml } from '../../core/utils/sanitizeOfferHtml'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import TouchButton from '../../components/touch/TouchButton'
import { MenuLandingSkeleton, CategoryItemsSkeleton } from '../../components/feedback/Skeletons'


const DOUBLE_TAP_MS = 400

const collectSubcategories = (category) => {
  const subs = Array.isArray(category?.sub_category) ? category.sub_category : []
  const orphanItems = Array.isArray(category?.items) ? category.items : []
  if (orphanItems.length === 0) return subs
  return [{ id: `cat-${category.id}-items`, name: null, items: orphanItems }, ...subs]
}

const SPICE_MAP = { none: 0, mild: 1, medium: 2, hot: 3, extra_hot: 4 }
const getSpiceLevel = (val) => SPICE_MAP[val] || 0

const formatPrice = (price, currency) => {
  const v = Number.isFinite(price) ? price : 0
  const formattedVal = Number.isInteger(v) ? v.toString() : v.toFixed(2)
  return `${currency || 'AED'} ${formattedVal}`
}

const toPlainText = (html) => {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

const groupOpts = (g) =>
  Array.isArray(g.options) ? g.options : (Array.isArray(g.variants) ? g.variants : (Array.isArray(g.items) ? g.items : []))

// "From" pricing for an upsell quick-add (no selections): applies limited pricing
// + base-price-group resolution, so upsell cards show/charge the discounted price.
const upsellPricing = (r) => {
  const p = resolveItemPricing(r, {}, r.variant_groups ?? [], r.addon_groups ?? [])
  return { price: p.base, original: p.originalBase, limited: p.base < p.originalBase }
}

// True when an item has variants or add-ons to choose — only then do we pop the
// QuickAddSheet. Plain items add straight to the cart (no extra click).
export const itemNeedsOptions = (it) =>
  (Array.isArray(it?.variant_groups) && it.variant_groups.length > 0) ||
  (Array.isArray(it?.addon_groups) && it.addon_groups.length > 0)

// Build the cart's modifier list for the current selections. Base-aware: the
// chosen Base Price Variant carries no surcharge (its value is in the base),
// while every other variant/add-on shows its adjustment.
const buildSelectedModifiers = (selections, variants, addons) => {
  const out = []
  variants.forEach((g) => {
    const opts = groupOpts(g)
      ; (selections[`variant_${g.id}`] || []).forEach((id) => {
        const o = opts.find((x) => x.id === id)
        if (!o) return
        // In a Base Price Group the option IS the base (its value is in basePrice,
        // not a surcharge), so it carries no add-on amount in the cart breakdown.
        out.push({ id: o.id, name: o.name, price: g.is_base_price_group ? 0 : (o.price || 0), groupId: g.id, groupName: g.name, type: 'variant' })
      })
  })
  addons.forEach((g) => {
    const opts = groupOpts(g)
      ; (selections[`addon_${g.id}`] || []).forEach((id) => {
        const o = opts.find((x) => x.id === id)
        if (!o) return
        out.push({ id: o.id, name: o.name, price: o.price || 0, groupId: g.id, groupName: g.name, type: 'addon' })
      })
  })
  return out
}

// ── Item card (light design) ─────────────────────────────────────────────────
const ItemCard = ({ item, t, onSelect, onIncrement }) => {
  const [imgFailed, setImgFailed] = useState(false)
  const available = item.is_available !== false
  const showImage = item.image_url && !imgFailed

  // Limited-time pricing (server-decided). Card shows the discounted "from" price
  // with the original struck through, plus a Limited Time badge.
  const limited = isLimitedActive(item)
  const cardOriginal = displayPrice(item)
  const cardPrice = limited ? discountedBaseOption(item, cardOriginal) : cardOriginal
  const cardSavings = Math.max(0, cardOriginal - cardPrice)
  const cardPct = cardOriginal > 0 ? Math.round((cardSavings / cardOriginal) * 100) : 0
  const cardDiscountLabel = item.discount_type === 'percentage'
    ? `${cardPct}% off`
    : `AED ${Number.isInteger(cardSavings) ? cardSavings : cardSavings.toFixed(2)} off`

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      className={`relative rounded-[1.4rem] bg-card border border-border shadow-card overflow-hidden flex flex-col ${!available ? 'opacity-50' : ''}`}
    >
      {/* Image — fixed h-40 matching lovable */}
      <TouchButton onClick={() => onSelect(item)} className="block text-left">
        <div className="relative item-card h-40 w-full overflow-hidden">
          {showImage ? (
            <img
              src={item.image_url}
              alt={item.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className={`w-full h-full object-cover ${!available ? 'grayscale' : ''}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-cream">
              <span className="text-3xl font-bold text-fg-muted/30">
                {item.name?.charAt(0)?.toUpperCase() ?? '?'}
              </span>
            </div>
          )}
          {/* Tag badge — top-left */}
          {(() => {
            const label = Array.isArray(item.badges) && item.badges.length > 0 ? item.badges[0].name : null
            return label ? (
              <span className="absolute top-2 left-2 px-2.5 item-card-badges font-bold py-1 rounded-full bg-primary text-secondary text-[9px] font-black tracking-[1px]">
                {label.toUpperCase()}
              </span>
            ) : null
          })()}
          {/* Discount badge — top-right (the savings; doubles as the limited-offer cue) */}
          {limited && available && cardSavings > 0 && (
            <span className="absolute top-2 right-2 px-2.5 py-1 item-card-badges rounded-full bg-primary text-secondary text-[10px] font-black uppercase tracking-wide shadow-sm">
              {cardDiscountLabel}
            </span>
          )}
          {/* Unavailable overlay */}
          {!available && (
            <div className="absolute inset-0 bg-black/35 backdrop-blur-[0.5px] flex items-center justify-center">
              <span className="px-3 py-1 rounded-full bg-primary/85 text-secondary text-[10px] font-black tracking-widest uppercase">
                {t('unavailable')}
              </span>
            </div>
          )}
        </div>

        {/* Name + description */}
        <div className="p-3 pb-2">
          <p className="font-bold text-[17px] item-card-title leading-tight text-fg line-clamp-1 min-h-[1.2em]">
            {item.name}
          </p>
          <p 
            className="mt-1 mb-2 text-fg item-card-desc line-clamp-2 min-h-[2.7em] font-sans leading-[18px]"
            style={{ fontSize: 'var(--font-size-body, 13px)' }}
          >
            {item.description ? toPlainText(item.description) : (item.arabic_name ?? ' ')}
          </p>
        </div>
      </TouchButton>

      {/* Bottom bar — price + Add button (always, matches lovable) */}
      <div className="px-3 pb-3 item-card-price mt-auto flex items-center justify-between gap-2">
        {limited ? (
          <div className="min-w-0 leading-none">
            <p className="font-display font-black text-primary text-[16px] text-lg leading-none">AED {cardPrice}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-fg-muted line-through leading-none">AED {cardOriginal}</p>
          </div>
        ) : (
          <p className="font-bold font-display font-black text-primary text-[16px] text-base">
            AED {cardPrice}
          </p>
        )}
        <motion.button
          whileTap={{ scale: 0.92 }}
          disabled={!available}
          onClick={(e) => { e.stopPropagation(); onIncrement(e) }}
          aria-label={`Add ${item.name}`}
          className="h-9 min-w-11 px-4 rounded-full bg-primary text-secondary font-bold text-[12px] tracking-wide shadow-soft active:scale-95 flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Nutrition row ────────────────────────────────────────────────────────────
const NutritionRow = ({ label, value, unit = '' }) =>
  value == null || value === '' ? null : (
    <div className="flex items-center justify-between border-b border-border py-2 text-[13px]">
      <span className="text-fg-muted">{label}</span>
      <span className="font-semibold text-fg">{value}{unit}</span>
    </div>
  )

// ── Quick-add bottom sheet ───────────────────────────────────────────────────
// Opened by the "+ Add" button on item cards (not the card tap).
// Same sheet UI as inside ItemDetailModal but without the full-screen detail view.
export const QuickAddSheet = ({ item, t, onClose, onAdded, onUnavailable, source }) => {
  const dispatch = useDispatch()
  const sessionId = useSelector(selectSessionId)
  const [quantity, setQuantity] = useState(1)
  const [selections, setSelections] = useState({})
  const [showConfirmAdd, setShowConfirmAdd] = useState(false)

  const available = item.is_available !== false
  const addons = Array.isArray(item.addon_groups) ? item.addon_groups : []
  const variants = Array.isArray(item.variant_groups) ? item.variant_groups : []
  const hasAllergens = Array.isArray(item.allergens) && item.allergens.length > 0
  const warnings = Array.isArray(item.ingredient_warnings) ? item.ingredient_warnings : []

  const spiceLevel = getSpiceLevel(item.spiciness_index)
  const hasSpiciness = spiceLevel > 0
  const selectedSpice = useMemo(() => {
    if (['hot', 'extra_hot'].includes(item.spiciness_index)) return 'spicy'
    return ['mild', 'medium'].includes(item.spiciness_index) ? item.spiciness_index : 'medium'
  }, [item.spiciness_index])

  const spiceOptions = [
    { value: 'mild', label: t('detail.spiciness_levels.mild', { defaultValue: 'Mild' }) },
    { value: 'medium', label: t('detail.spiciness_levels.medium', { defaultValue: 'Medium' }) },
    { value: 'spicy', label: t('detail.spiciness_levels.spicy', { defaultValue: 'Spicy' }) }
  ]

  // Resolved pricing for the current selections (handles base-price variants +
  // limited pricing). Recomputed each render as selections change.
  const pricing = resolveItemPricing(item, selections, variants, addons)
  const baseUnitPrice = pricing.base
  const originalPrice = pricing.originalBase
  const limited = baseUnitPrice < originalPrice
  const savings = Math.max(0, originalPrice - baseUnitPrice)
  const savingsPct = originalPrice > 0 ? Math.round((savings / originalPrice) * 100) : 0

  const calculateTotal = () => (pricing.base + pricing.extras) * quantity

  const isValid = () =>
    [...variants, ...addons].every((group) => {
      if (!group.is_required && !group.is_base_price_group) return true
      const key = variants.includes(group) ? `variant_${group.id}` : `addon_${group.id}`
      return (selections[key] || []).length > 0
    })

  const handleAddToCart = async () => {
    if (!isValid() || !available) return

    // Backend gate — never add an item that has gone unavailable since the menu
    // was loaded, even if the client's cached menu is stale.
    const gate = await checkItemAvailable(item.id)
    if (!gate.available) { if (onUnavailable) onUnavailable(item); return }

    const selectedModifiers = buildSelectedModifiers(selections, variants, addons)
    if (hasSpiciness && selectedSpice) {
      const defaultLabels = { mild: 'Mild', medium: 'Medium', spicy: 'Spicy' }
      const label = t(`detail.spiciness_levels.${selectedSpice}`, { defaultValue: defaultLabels[selectedSpice] || selectedSpice })
      selectedModifiers.push({
        id: `spice-${selectedSpice}`,
        name: `Spice Level: ${label}`,
        price: 0,
        type: 'spice'
      })
    }
    const cartItemId = `${item.id}-${selectedModifiers.map((m) => m.id).sort().join('-') || 'plain'}`
    dispatch(addItem({
      id: cartItemId,
      originalId: item.id,
      name: item.name,
      basePrice: pricing.base,              // effective (limited + base-variant resolved)
      originalBasePrice: pricing.originalBase, // pre-discount, for strike-through
      isLimited: pricing.base < pricing.originalBase,
      discountType: item.discount_type,    // "price" | "percentage" — for cart display
      modifierTotal: pricing.extras,        // additive modifiers (sent to backend re-pricing)
      price: pricing.base + pricing.extras,
      quantity,
      currency: item.currency,
      image_url: item.image_url,
      modifiers: selectedModifiers,
    }))
    if (sessionId) logEvent({ event_type: EVENT_TYPES.ITEM_ADDED, item_id: item.id, item_name: item.name, quantity, ...(source ? { source } : {}), session_id: sessionId })
    if (onAdded) onAdded(item)
    onClose()
  }

  const renderModifierGroup = (group, type) => {
    const options = Array.isArray(group.options) ? group.options : (Array.isArray(group.variants) ? group.variants : (Array.isArray(group.items) ? group.items : []))
    if (options.length === 0) return null
    const groupKey = `${type}_${group.id}`
    const isMulti = group.max_selections > 1 || !group.max_selections
    const isRequired = group.is_required
    const selectedOpts = selections[groupKey] || []
    const handleToggle = (option) => {
      setSelections((prev) => {
        const current = prev[groupKey] || []
        if (isMulti) {
          if (current.includes(option.id)) return { ...prev, [groupKey]: current.filter((id) => id !== option.id) }
          if (group.max_selections && current.length >= group.max_selections) return prev
          return { ...prev, [groupKey]: [...current, option.id] }
        }
        return { ...prev, [groupKey]: [option.id] }
      })
    }
    return (
      <section key={groupKey}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg">{group.name}</h3>
          {isRequired && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary border border-primary/20">Required</span>}
        </div>
        {!isMulti ? (
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => {
              const isSelected = selectedOpts.includes(opt.id)
              return (
                <TouchButton
                  key={opt.id}
                  onClick={() => handleToggle(opt)}
                  className={`h-11 px-5 rounded-full border font-bold text-[13px] flex items-center justify-center transition-all active:scale-95 ${isSelected
                      ? 'bg-primary border-primary text-secondary shadow-soft'
                      : 'bg-card border-border text-fg'
                    }`}
                >
                  <span>{opt.name}</span>
                  {group.is_base_price_group ? (
                    isLimitedActive(item) ? (
                      <span className="ml-1.5 flex items-center gap-1.5 leading-none">
                        <span className={`relative text-[10px] font-semibold leading-none ${isSelected ? 'text-secondary/70' : 'text-fg-muted'}`}>
                          {opt.price}
                          <span className="absolute left-0 right-0 top-[52%] h-[1px] bg-current -translate-y-1/2" />
                        </span>
                        <span className={`text-[11px] font-black leading-none ${isSelected ? 'text-fg' : 'text-primary'}`}>{discountedBaseOption(item, opt.price)}</span>
                      </span>
                    ) : (
                      <span className={`ml-1 text-[11px] font-black ${isSelected ? 'text-secondary' : 'text-primary'}`}>{opt.price}</span>
                    )
                  ) : (
                    opt.price > 0 && (
                      <span className={`ml-1 text-[11px] font-black ${isSelected ? 'text-secondary' : 'text-primary'}`}>
                        +{opt.price}
                      </span>
                    )
                  )}
                </TouchButton>
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {options.map((opt) => {
              const isSelected = selectedOpts.includes(opt.id)
              return (
                <TouchButton
                  key={opt.id}
                  onClick={() => handleToggle(opt)}
                  className={`h-12 px-3 rounded-full border flex items-center justify-between text-left transition-all active:scale-95 ${isSelected ? 'bg-primary text-secondary border-primary shadow-soft' : 'bg-card border-border text-fg'
                    }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-white border-white' : 'border-border'}`}>
                      {isSelected && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-[13px] font-bold truncate ${isSelected ? 'text-secondary' : 'text-fg'}`}>{opt.name}</span>
                  </span>
                  {group.is_base_price_group ? (
                    isLimitedActive(item) ? (
                      <span className="flex items-center gap-1.5 shrink-0 leading-none">
                        <span className={`relative text-[10px] font-semibold leading-none ${isSelected ? 'text-secondary/70' : 'text-fg-muted'}`}>
                          {opt.price}
                          <span className="absolute left-0 right-0 top-[52%] h-[1px] bg-current -translate-y-1/2" />
                        </span>
                        <span className={`text-[11px] font-black leading-none ${isSelected ? 'text-secondary' : 'text-primary'}`}>{discountedBaseOption(item, opt.price)}</span>
                      </span>
                    ) : (
                      <span className={`text-[11px] font-black shrink-0 ${isSelected ? 'text-secondary' : 'text-primary'}`}>{opt.price}</span>
                    )
                  ) : (
                    opt.price > 0 && (
                      <span className={`text-[11px] font-black shrink-0 ${isSelected ? 'text-secondary' : 'text-primary'}`}>
                        +{opt.price}
                      </span>
                    )
                  )}
                </TouchButton>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-white/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-[2rem] shadow-float overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Drag handle */}
        <div className="pt-2.5 flex flex-col items-center">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-3">
          {item.image_url && (
            <img src={item.image_url} alt={item.name}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-border shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-fg-muted font-bold">Add to Order</p>
            <h2 className="font-display italic font-black text-xl text-fg truncate">{item.name}</h2>
            {/* Pricing — one clean line: current price, struck original, and a
                single discount pill (% off or amount saved). */}
            {limited ? (
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className="text-[19px] font-black text-primary leading-none">{formatPrice(baseUnitPrice, item.currency)}</span>
                <span className="relative inline-block text-[12.5px] font-bold text-fg-muted leading-none">
                  {formatPrice(originalPrice, item.currency)}
                  <span className="absolute left-0 right-0 top-[52%] h-[1px] bg-current -translate-y-1/2" />
                </span>
                {savings > 0 && (
                  <span className="rounded-full bg-primary px-2 py-[3px] text-[9.5px] font-black uppercase tracking-wide text-secondary leading-none">
                    {item.discount_type === 'price'
                      ? t('detail.save_amount', { amount: formatPrice(savings, item.currency) })
                      : t('detail.save_percent', { percent: savingsPct })}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-[19px] font-black text-primary leading-none">{formatPrice(item.price, item.currency)}</p>
            )}
          </div>
          <TouchButton onClick={onClose} aria-label="Close"
            className="h-10 w-10 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform shrink-0">
            <X className="h-4 w-4" />
          </TouchButton>
        </div>

        {/* Body */}
        <div className="px-5 pb-4 overflow-y-auto flex-1 space-y-5">
          {variants.map((g) => renderModifierGroup(g, 'variant'))}

          {hasSpiciness && (
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg mb-2">Spice Level</h3>
              <div className="flex gap-1.5 flex-wrap">
                <span 
                  className="px-3 h-8 inline-flex items-center rounded-full bg-primary/10 text-primary font-bold"
                  style={{ fontSize: 'var(--font-size-body, 11px)' }}
                >
                  {spiceOptions.find(o => o.value === selectedSpice)?.label || selectedSpice}
                </span>
              </div>
            </section>
          )}

          {addons.map((g) => renderModifierGroup(g, 'addon'))}

          {warnings.length > 0 && (
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg mb-2">Allergens</h3>
              <div className="flex gap-2 flex-wrap">
                {warnings.map((w) => (
                  <span 
                    key={w.id} 
                    className="rounded-full bg-red-500/10 px-3 py-1 font-bold text-red-500 border border-red-500/20"
                    style={{ fontSize: 'var(--font-size-body, 12px)' }}
                  >
                    {w.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {hasAllergens && (
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg mb-2">Allergens</h3>
              <div className="flex gap-1.5 flex-wrap">
                {item.allergens.map((a) => (
                  <span 
                    key={a} 
                    className="px-3 h-8 inline-flex items-center rounded-full bg-primary/10 text-primary font-bold"
                    style={{ fontSize: 'var(--font-size-body, 11px)' }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg">Quantity</h3>
            <div className="flex items-center gap-3">
              <TouchButton onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease"
                className="h-11 w-11 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform">
                <Minus className="h-4 w-4" />
              </TouchButton>
              <span className="w-8 text-center font-display font-black text-xl text-fg">{quantity}</span>
              <TouchButton onClick={() => setQuantity((q) => q + 1)} aria-label="Increase"
                className="h-11 w-11 rounded-full bg-primary text-secondary flex items-center justify-center active:scale-90 transition-transform">
                <Plus className="h-4 w-4" />
              </TouchButton>
            </div>
          </section>
        </div>

        {/* Sticky CTA */}
        <div className="px-5 py-4 border-t border-border bg-card/95 backdrop-blur flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.16em] text-fg-muted font-bold">Total</p>
            <p className="font-display font-black text-2xl text-primary leading-none mt-0.5">AED {calculateTotal()}</p>
          </div>
          <motion.div whileTap={{ scale: 0.96 }}>
            <TouchButton onClick={() => setShowConfirmAdd(true)} disabled={!isValid() || !available}
              className="h-14 px-6 rounded-2xl bg-primary text-secondary font-bold text-sm shadow-float disabled:opacity-50">
              Add to Order
            </TouchButton>
          </motion.div>
        </div>
      </motion.div>


      {/* Confirmation Popup */}
      <AnimatePresence>
        {showConfirmAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-5 pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-card w-[98vw] max-w-[450px] rounded-3xl p-8 shadow-xl"
            >
              <h3 className="font-display font-bold text-xl text-heading text-center mb-6 leading-tight">Are u sure want to add this item in cart?</h3>
              <div className="flex gap-3">
                <TouchButton
                  onClick={() => setShowConfirmAdd(false)}
                  className="flex-1 h-12 rounded-2xl border border-border text-fg font-bold"
                >
                  No
                </TouchButton>
                <TouchButton
                  onClick={() => {
                    setShowConfirmAdd(false)
                    handleAddToCart()
                  }}
                  className="flex-1 h-12 rounded-2xl bg-primary text-secondary font-bold"
                >
                  Yes
                </TouchButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

const findCategoryAndItems = (menu, itemId, catView, categories, t) => {
  // 1. If catView is active, use it
  if (catView) {
    const subcats = collectSubcategories(catView)
    const allItemsInCat = []
    subcats.forEach(s => {
      if (Array.isArray(s.items)) {
        s.items.forEach(it => {
          if (!allItemsInCat.some(existing => existing.id === it.id)) {
            allItemsInCat.push(it)
          }
        })
      }
    })
    const index = allItemsInCat.findIndex(it => it.id === itemId)
    if (index !== -1) {
      return {
        categoryName: catView.id === 'all' ? t('all_categories') : catView.name,
        items: allItemsInCat,
        currentIndex: index
      }
    }
  }

  // 2. Otherwise look in derived categories array
  const catsToSearch = Array.isArray(categories) ? categories : []
  for (const cat of catsToSearch) {
    if (cat.id === 'all') continue
    const subcats = collectSubcategories(cat)
    const allItemsInCat = []
    subcats.forEach(s => {
      if (Array.isArray(s.items)) {
        s.items.forEach(it => {
          if (!allItemsInCat.some(existing => existing.id === it.id)) {
            allItemsInCat.push(it)
          }
        })
      }
    })
    const index = allItemsInCat.findIndex(it => it.id === itemId)
    if (index !== -1) {
      return {
        categoryName: cat.name,
        items: allItemsInCat,
        currentIndex: index
      }
    }
  }

  // 3. Fallback: Search menu categories directly
  if (menu && Array.isArray(menu.categories)) {
    for (const cat of menu.categories) {
      const subcats = collectSubcategories(cat)
      const allItemsInCat = []
      subcats.forEach(s => {
        if (Array.isArray(s.items)) {
          s.items.forEach(it => {
            if (!allItemsInCat.some(existing => existing.id === it.id)) {
              allItemsInCat.push(it)
            }
          })
        }
      })
      const index = allItemsInCat.findIndex(it => it.id === itemId)
      if (index !== -1) {
        return {
          categoryName: cat.name,
          items: allItemsInCat,
          currentIndex: index
        }
      }
    }
  }

  return null
}

// ── Item detail modal (lovable design) ──────────────────────────────────────
const ItemDetailModal = ({ item: initialItem, t, onClose, onAdded, onUnavailable, onOpenCart, onNavigate, onToast, itemsById, menu, catView, categories, source }) => {
  const [item, setItem] = useState(initialItem)
  const dispatch = useDispatch()
  const sessionId = useSelector(selectSessionId)
  const cartCount = useSelector(selectCartCount)
  const cartTotal = useSelector(selectCartTotal)
  const cartItems = useSelector(selectCartItems)
  const currency = cartItems.length > 0 ? cartItems[0].currency : 'AED'
  const [imgFailed, setImgFailed] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [selections, setSelections] = useState({})
  const [showSheet, setShowSheet] = useState(false)
  const [direction, setDirection] = useState(0) // -1 or 1
  const [activeImage, setActiveImage] = useState(0) // index into the item image gallery
  const [showConfirmAdd, setShowConfirmAdd] = useState(false)
  const ymaylScrollRef = useRef(null)

  useEffect(() => {
    setQuantity(1)
    setSelections({})
    setImgFailed(false)
    setActiveImage(0)
  }, [item?.id])

  // ── Item dwell ─────────────────────────────────────────────────────────────
  // Keyed on the modal's own `item` state (not the parent's selectedItem) so
  // swiping to a sibling item via goToNext/goToPrev logs a dwell event per item.
  const itemDwellStartRef = useRef(null)
  useEffect(() => {
    if (!item) return
    itemDwellStartRef.current = Date.now()
    const itemId = item.id
    const itemName = item.name
    const categoryId = catView?.id ?? null
    return () => {
      if (sessionId && itemDwellStartRef.current) {
        logEvent({
          event_type: EVENT_TYPES.ITEM_DWELL,
          item_id: itemId,
          item_name: itemName,
          category_id: categoryId,
          source: source ?? null,
          dwell_ms: Date.now() - itemDwellStartRef.current,
          session_id: sessionId,
        })
      }
      itemDwellStartRef.current = null
    }
  }, [item?.id, sessionId])

  const catInfo = useMemo(() => {
    return findCategoryAndItems(menu, item?.id, catView, categories, t)
  }, [menu, item?.id, catView, categories, t])

  const categoryName = catInfo?.categoryName || ''
  const categoryItems = catInfo?.items || []
  const currentIndex = catInfo?.currentIndex ?? 0
  const totalItems = categoryItems.length

  const goToNext = () => {
    if (categoryItems.length > 1) {
      setDirection(1)
      const nextIndex = (currentIndex + 1) % categoryItems.length
      setItem(categoryItems[nextIndex])
    }
  }

  const goToPrev = () => {
    if (categoryItems.length > 1) {
      setDirection(-1)
      const prevIndex = (currentIndex - 1 + categoryItems.length) % categoryItems.length
      setItem(categoryItems[prevIndex])
    }
  }

  // Item image gallery: primary image first, then the additional gallery images.
  // De-duped, blank-filtered. Browsed via arrows + dots inside the hero area.
  const galleryImages = useMemo(() => {
    const primary = item.image_url ? [item.image_url] : []
    const extra = Array.isArray(item.gallery_images)
      ? item.gallery_images.map((g) => g?.image_url).filter(Boolean)
      : []
    return [...new Set([...primary, ...extra])]
  }, [item.image_url, item.gallery_images])

  const hasGallery = galleryImages.length > 1
  const safeActive = Math.min(activeImage, Math.max(0, galleryImages.length - 1))
  const activeImageUrl = galleryImages[safeActive] ?? item.image_url

  // Step through gallery images (wraps around). Resets the per-image error flag.
  const goToImage = (idx) => {
    if (galleryImages.length < 2) return
    setImgFailed(false)
    setActiveImage((idx + galleryImages.length) % galleryImages.length)
  }
  const nextImage = (e) => { e?.stopPropagation?.(); goToImage(safeActive + 1) }
  const prevImage = (e) => { e?.stopPropagation?.(); goToImage(safeActive - 1) }

  const showImage = activeImageUrl && !imgFailed
  const available = item.is_available !== false
  const spiceLevel = getSpiceLevel(item.spiciness_index)
  const hasSpiciness = spiceLevel > 0
  const selectedSpice = useMemo(() => {
    if (['hot', 'extra_hot'].includes(item.spiciness_index)) return 'spicy'
    return ['mild', 'medium'].includes(item.spiciness_index) ? item.spiciness_index : 'medium'
  }, [item.spiciness_index])

  const spiceOptions = [
    { value: 'mild', label: t('detail.spiciness_levels.mild', { defaultValue: 'Mild' }) },
    { value: 'medium', label: t('detail.spiciness_levels.medium', { defaultValue: 'Medium' }) },
    { value: 'spicy', label: t('detail.spiciness_levels.spicy', { defaultValue: 'Spicy' }) }
  ]

  const addons = Array.isArray(item.addon_groups) ? item.addon_groups : []
  const variants = Array.isArray(item.variant_groups) ? item.variant_groups : []
  const badges = Array.isArray(item.badges) ? item.badges : []
  const warnings = Array.isArray(item.ingredient_warnings) ? item.ingredient_warnings : []
  const hasAllergens = Array.isArray(item.allergens) && item.allergens.length > 0
  const hasNutrition = [item.calories, item.fat, item.sodium, item.protein, item.calcium, item.serving_size, item.carbon_footprint].some((v) => v != null && v !== '')

  // Resolved pricing for the current selections (base-price variants + limited).
  const pricing = resolveItemPricing(item, selections, variants, addons)
  const baseUnitPrice = pricing.base
  const originalPrice = pricing.originalBase
  const limited = baseUnitPrice < originalPrice
  const savings = Math.max(0, originalPrice - baseUnitPrice)
  const savingsPct = originalPrice > 0 ? Math.round((savings / originalPrice) * 100) : 0

  const calculateTotal = () => (pricing.base + pricing.extras) * quantity

  const isValid = () =>
    [...variants, ...addons].every((group) => {
      if (!group.is_required && !group.is_base_price_group) return true
      const key = variants.includes(group) ? `variant_${group.id}` : `addon_${group.id}`
      return (selections[key] || []).length > 0
    })

  const handleAddToCart = async () => {
    if (!isValid() || !available) return

    // Backend gate — never add an item that has gone unavailable since the menu
    // was loaded, even if the client's cached menu is stale.
    const gate = await checkItemAvailable(item.id)
    if (!gate.available) { if (onUnavailable) onUnavailable(item); return }

    const selectedModifiers = buildSelectedModifiers(selections, variants, addons)

    if (hasSpiciness && selectedSpice) {
      const defaultLabels = { mild: 'Mild', medium: 'Medium', spicy: 'Spicy' }
      const label = t(`detail.spiciness_levels.${selectedSpice}`, { defaultValue: defaultLabels[selectedSpice] || selectedSpice })
      selectedModifiers.push({
        id: `spice-${selectedSpice}`,
        name: `Spice Level: ${label}`,
        price: 0,
        type: 'spice'
      })
    }

    const cartItemId = `${item.id}-${selectedModifiers.map((m) => m.id).sort().join('-') || 'plain'}`
    dispatch(addItem({
      id: cartItemId,
      originalId: item.id,
      name: item.name,
      basePrice: pricing.base,                 // effective (limited + base-variant resolved)
      originalBasePrice: pricing.originalBase, // pre-discount, for strike-through
      isLimited: pricing.base < pricing.originalBase,
      discountType: item.discount_type,    // "price" | "percentage" — for cart display
      modifierTotal: pricing.extras,           // additive modifiers (sent to backend re-pricing)
      price: pricing.base + pricing.extras,
      quantity,
      currency: item.currency,
      image_url: item.image_url,
      modifiers: selectedModifiers,
    }))
    if (sessionId) logEvent({ event_type: EVENT_TYPES.ITEM_ADDED, item_id: item.id, item_name: item.name, quantity, ...(source ? { source } : {}), session_id: sessionId })
    setShowSheet(false)
    if (onAdded) { onAdded(item) } else { onClose() }
  }

  // "You may also like" — if the item has variants/add-ons, pop the same
  // QuickAddSheet to choose them; otherwise add straight to the cart (no extra step).
  const [upsellSheetItem, setUpsellSheetItem] = useState(null)
  const [addedUpsellId, setAddedUpsellId] = useState(null)
  const handleUpsell = async (r) => {
    if (itemNeedsOptions(r)) { setUpsellSheetItem(r); return }

    // Backend gate — skip the add if the item has gone unavailable.
    const gate = await checkItemAvailable(r.id)
    if (!gate.available) { if (onUnavailable) onUnavailable(r); return }

    const rp = upsellPricing(r)
    dispatch(addItem({
      id: `${r.id}-plain`,
      originalId: r.id,
      name: r.name,
      basePrice: rp.price,
      originalBasePrice: rp.original,
      isLimited: rp.limited,
      discountType: r.discount_type,
      modifierTotal: 0,
      price: rp.price,
      quantity: 1,
      currency: r.currency,
      image_url: r.image_url,
      modifiers: [],
    }))
    if (sessionId) logEvent({ event_type: EVENT_TYPES.ITEM_ADDED, item_id: r.id, item_name: r.name, quantity: 1, source: 'upsell', session_id: sessionId })
    setAddedUpsellId(r.id)
    setTimeout(() => setAddedUpsellId((cur) => (cur === r.id ? null : cur)), 1300)
    if (onToast) onToast(r)
  }

  const renderModifierGroup = (group, type) => {
    const options = Array.isArray(group.options) ? group.options : (Array.isArray(group.variants) ? group.variants : (Array.isArray(group.items) ? group.items : []))
    if (options.length === 0) return null
    const groupKey = `${type}_${group.id}`
    const isMulti = group.max_selections > 1 || !group.max_selections
    const isRequired = group.is_required
    const selectedOpts = selections[groupKey] || []

    const handleToggle = (option) => {
      setSelections((prev) => {
        const current = prev[groupKey] || []
        if (isMulti) {
          if (current.includes(option.id)) return { ...prev, [groupKey]: current.filter((id) => id !== option.id) }
          if (group.max_selections && current.length >= group.max_selections) return prev
          return { ...prev, [groupKey]: [...current, option.id] }
        }
        return { ...prev, [groupKey]: [option.id] }
      })
    }

    return (
      <section key={groupKey}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg">{group.name}</h3>
          {isRequired && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary border border-primary/20">Required</span>}
        </div>
        {!isMulti ? (
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => {
              const isSelected = selectedOpts.includes(opt.id)
              return (
                <TouchButton
                  key={opt.id}
                  onClick={() => handleToggle(opt)}
                  className={`h-11 px-5 rounded-full border font-bold text-[13px] flex items-center justify-center transition-all active:scale-95 ${isSelected
                      ? 'bg-primary border-primary text-secondary shadow-soft'
                      : 'bg-card border-border text-fg'
                    }`}
                >
                  <span>{opt.name}</span>
                  {group.is_base_price_group ? (
                    isLimitedActive(item) ? (
                      <span className="ml-1.5 flex items-center gap-1.5 leading-none">
                        <span className={`relative text-[10px] font-semibold leading-none ${isSelected ? 'text-secondary/70' : 'text-fg-muted'}`}>
                          {opt.price}
                          <span className="absolute left-0 right-0 top-[52%] h-[1px] bg-current -translate-y-1/2" />
                        </span>
                        <span className={`text-[11px] font-black leading-none ${isSelected ? 'text-fg' : 'text-primary'}`}>{discountedBaseOption(item, opt.price)}</span>
                      </span>
                    ) : (
                      <span className={`ml-1 text-[11px] font-black ${isSelected ? 'text-fg/85' : 'text-primary'}`}>{opt.price}</span>
                    )
                  ) : (
                    opt.price > 0 && (
                      <span className={`ml-1 text-[11px] font-black ${isSelected ? 'text-fg/85' : 'text-primary'}`}>
                        +{opt.price}
                      </span>
                    )
                  )}
                </TouchButton>
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {options.map((opt) => {
              const isSelected = selectedOpts.includes(opt.id)
              return (
                <TouchButton
                  key={opt.id}
                  onClick={() => handleToggle(opt)}
                  className={`h-12 px-3 rounded-full border flex items-center justify-between text-left transition-all active:scale-95 ${isSelected ? 'bg-primary text-secondary border-primary shadow-soft' : 'bg-card border-border text-fg'
                    }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-white border-white' : 'border-border'}`}>
                      {isSelected && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-[13px] font-bold truncate ${isSelected ? 'text-secondary' : 'text-fg'}`}>{opt.name}</span>
                  </span>
                  {group.is_base_price_group ? (
                    isLimitedActive(item) ? (
                      <span className="flex items-center gap-1.5 shrink-0 leading-none">
                        <span className={`relative text-[10px] font-semibold leading-none ${isSelected ? 'text-secondary/70' : 'text-fg-muted'}`}>
                          {opt.price}
                          <span className="absolute left-0 right-0 top-[52%] h-[1px] bg-current -translate-y-1/2" />
                        </span>
                        <span className={`text-[11px] font-black leading-none ${isSelected ? 'text-secondary' : 'text-primary'}`}>{discountedBaseOption(item, opt.price)}</span>
                      </span>
                    ) : (
                      <span className={`text-[11px] font-black shrink-0 ${isSelected ? 'text-secondary' : 'text-primary'}`}>{opt.price}</span>
                    )
                  ) : (
                    opt.price > 0 && (
                      <span className={`text-[11px] font-black shrink-0 ${isSelected ? 'text-secondary' : 'text-primary'}`}>
                        +{opt.price}
                      </span>
                    )
                  )}
                </TouchButton>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  const hasModifiers = variants.length > 0 || addons.length > 0
  const ymayl = itemsById
    ? (item.upsell_item_ids ?? []).map((id) => itemsById.get(id)).filter((r) => r && r.is_available !== false)
    : []

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      {/* Top-half cream bg + blobs */}
      <div className="absolute top-0 left-0 right-0 h-[50%] bg-gradient-cream -z-10" />
      <div className="absolute top-16 -right-16 h-56 w-56 blob-mask bg-blush/70 -z-10 animate-blob" />
      <div className="absolute top-28 -left-16 h-48 w-48 blob-mask-2 bg-peach/60 -z-10" />

      {console.log('ITEM DATA:', item)}

      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-32">

        {/* Full-width Image Area with Nav overlays */}
        <div className="relative w-full h-[440px] shrink-0 bg-muted">
          {/* Top Header Overlay */}
          <div className="absolute top-0 inset-x-0 z-50 pt-2 pb-2 px-5 bg-[#FFFFFF78] flex items-center justify-between pointer-events-none">
            <TouchButton onClick={onClose} aria-label="Back"
              className="pointer-events-auto h-10 w-10 rounded-full bg-white shadow-soft flex items-center justify-center shrink-0 active:scale-95 transition-transform">
              <ArrowLeft className="h-5 w-5 text-obsidian" />
            </TouchButton>

            {categoryName && (
              <div className="pointer-events-auto bg-[#FFFFFFB2] px-6 h-[38px] flex items-center justify-center rounded-[50px] shadow-soft">
                <span className="text-[14px] font-[600] uppercase text-[#000000] tracking-[0.05em]">
                  {categoryName}
                </span>
              </div>
            )}

            <TouchButton
              onClick={() => { if (cartCount > 0 && onOpenCart) onOpenCart() }}
              disabled={cartCount === 0}
              aria-label={t('view_cart', { defaultValue: 'View cart' })}
              className={`pointer-events-auto relative h-10 rounded-full bg-primary shadow-soft flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-100 ${cartCount > 0 ? 'px-3 gap-1.5 min-w-[4rem]' : 'w-10'
                }`}>
              <ShoppingBag className="h-5 w-5 text-secondary" />
              {cartCount > 0 && (
                <span className="text-[13px] font-black text-secondary ml-0.5 whitespace-nowrap">
                  {currency} {cartTotal}
                </span>
              )}
            </TouchButton>
          </div>

          {/* Hero Image Swiper */}
          {(() => {
            const itemImages = Array.from(new Set([
              item.image_url,
              ...(Array.isArray(item.gallery_images) ? item.gallery_images.map(g => g.image_url) : [])
            ].filter(Boolean)));

            return (
              <>
                <Swiper
                  modules={[Navigation, Pagination]}
                  navigation={{
                    prevEl: '.custom-swiper-prev',
                    nextEl: '.custom-swiper-next'
                  }}
                  pagination={{
                    el: '.custom-swiper-pagination',
                    clickable: true
                  }}
                  className="w-full h-full"
                >
                  {itemImages.length > 0 ? (
                    itemImages.map((imgUrl, idx) => (
                      <SwiperSlide key={idx} className="w-full h-full relative">
                        <img src={imgUrl} alt={`${item.name} image ${idx + 1}`}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            if (e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.style.display = 'flex';
                          }}
                          className={`w-full h-full object-cover ${!available ? 'opacity-60 grayscale' : ''}`} />
                        <div className="hidden w-full h-full bg-gradient-cream flex-col items-center justify-center absolute inset-0">
                          <span className="text-6xl font-black text-fg-muted/30">{item.name?.charAt(0)?.toUpperCase() ?? '?'}</span>
                        </div>
                        {!available && (
                          <div className="absolute inset-0 z-20 flex items-center justify-center">
                            <span className="px-4 py-2 rounded-full bg-primary/85 text-secondary text-xs font-bold tracking-wider">{t('unavailable')}</span>
                          </div>
                        )}
                      </SwiperSlide>
                    ))
                  ) : (
                    <SwiperSlide className="w-full h-full relative">
                      <div className="w-full h-full bg-gradient-cream flex items-center justify-center">
                        <span className="text-6xl font-black text-fg-muted/30">{item.name?.charAt(0)?.toUpperCase() ?? '?'}</span>
                      </div>
                    </SwiperSlide>
                  )}
                </Swiper>

                {/* Left Arrow */}
                {itemImages.length > 1 && (
                  <div className="custom-swiper-prev absolute left-4 top-1/2 -translate-y-1/2 z-40 active:scale-95 transition-transform cursor-pointer flex items-center justify-center w-11 h-11 rounded-full bg-primary text-secondary shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50" fill="none">
                      <path d="M25 31.8521L18.15 25L25 18.1479L26.4333 19.5833L22.0583 23.9583H32.2917V26.0417H22.0583L26.4333 30.4167L25 31.8521Z" fill="currentColor" />
                    </svg>
                  </div>
                )}

                {/* Right Arrow */}
                {itemImages.length > 1 && (
                  <div className="custom-swiper-next absolute right-4 top-1/2 -translate-y-1/2 z-40 active:scale-95 transition-transform drop-shadow-md cursor-pointer flex items-center justify-center w-11 h-11 rounded-full bg-primary text-secondary shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50" fill="none" className="rotate-180">
                      <path d="M25 31.8521L18.15 25L25 18.1479L26.4333 19.5833L22.0583 23.9583H32.2917V26.0417H22.0583L26.4333 30.4167L25 31.8521Z" fill="currentColor" />
                    </svg>
                  </div>
                )}

                {/* Page indicator dots */}
                {itemImages.length > 1 && (
                  <div className="custom-swiper-pagination absolute inset-x-0 flex justify-center items-center gap-[4px] z-40 [&_.swiper-pagination-bullet]:!w-[12px] [&_.swiper-pagination-bullet]:!h-[12px] [&_.swiper-pagination-bullet]:!rounded-full [&_.swiper-pagination-bullet]:!bg-white [&_.swiper-pagination-bullet]:!opacity-100 [&_.swiper-pagination-bullet]:!m-0 [&_.swiper-pagination-bullet]:shadow-sm [&_.swiper-pagination-bullet]:transition-all [&_.swiper-pagination-bullet]:duration-300 [&_.swiper-pagination-bullet-active]:!w-[13px] [&_.swiper-pagination-bullet-active]:!bg-primary" />
                )}
              </>
            )
          })()}
        </div>

        {/* Bottom Sheet Card Content */}
        <div className="relative z-20 bg-background rounded-t-[2.5rem] -mt-14 pt-5 pb-32 px-5 flex-1">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={item.id}
              custom={direction}
              variants={{
                enter: (dir) => ({ x: dir * 180, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (dir) => ({ x: -dir * 180, opacity: 0 })
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ x: { type: 'spring', stiffness: 320, damping: 32 }, opacity: { duration: 0.15 } }}
              className="w-full flex flex-col"
            >
              {/* Name & Price */}
              <div className="text-center">
                <h1 
                  className="font-bold text-fg leading-tight px-2"
                  style={{ fontSize: 'var(--font-size-heading, 26px)' }}
                >
                  {item.name}
                </h1>
                {item.arabic_name && <p className="mt-1 text-sm font-medium text-fg-muted font-sans" dir="rtl">{item.arabic_name}</p>}

                {limited ? (
                  <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
                    <span className="font-bold text-[20px] text-primary leading-none">{formatPrice(baseUnitPrice, item.currency)}</span>
                    <span className="relative inline-block text-[15px] font-bold text-fg-muted">
                      {formatPrice(originalPrice, item.currency)}
                      <span className="absolute left-0 right-0 top-[52%] h-[1.5px] bg-current -translate-y-1/2" />
                    </span>
                    {savingsPct > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-black uppercase tracking-wide text-secondary">{savingsPct}% off</span>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 font-bold text-[20px] text-primary leading-none">
                    {formatPrice(item.price, item.currency)}
                  </p>
                )}

                {item.description && (
                  <div className="mt-4 px-1">
                    <p 
                      className="leading-relaxed text-fg font-sans" 
                      style={{ fontSize: 'var(--font-size-body, 14px)' }}
                      dangerouslySetInnerHTML={renderSafeOfferHtml(item.description)} 
                    />
                  </div>
                )}
              </div>

              {/* Attribute chips */}
              {(item.tag || item.contains_high_salt || (badges && badges.length > 0)) && (
                <div className="mt-6 flex flex-wrap justify-center gap-2 px-6">
                  {item.contains_high_salt && (
                    <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-secondary border border-primary">
                      <AlertTriangle className="h-3.5 w-3.5" /> High Salt
                    </span>
                  )}
                  {item.tag && (
                    <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-fg border border-border shadow-sm">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.tag.color || '#333' }} />
                      {item.tag.name}
                    </span>
                  )}
                  {badges && badges.map((b) => (
                    <span key={b.id} className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary">
                      {b.name}
                    </span>
                  ))}
                </div>
              )}

              {/* CTAs */}
              {available && (
                <div className="mt-8 space-y-3 max-w-[420px] mx-auto w-full">
                  {hasModifiers && (
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <TouchButton onClick={() => setShowSheet(true)}
                        className="w-full h-[48px] rounded-full font-medium bg-white border-2 border-primary font-black text-[16px] tracking-wide flex items-center justify-center gap-2 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0">
                          <path d="M20.75 5H17.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M13.75 3V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M13.75 5H2.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M6.75 12H2.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M10.75 10V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M21.75 12H10.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M20.75 19H17.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M13.75 17V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M13.75 19H2.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Customize Your Order
                      </TouchButton>
                    </motion.div>
                  )}
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <TouchButton onClick={() => setShowSheet(true)}
                      className="w-full h-[48px] font-medium rounded-full bg-primary text-secondary font-black text-[16px] tracking-wide shadow-[0_8px_20px_rgba(224,75,62,0.3)] flex items-center justify-center">
                      Add to Order · AED {Number.isFinite(baseUnitPrice) ? baseUnitPrice : '0'}
                    </TouchButton>
                  </motion.div>
                </div>

              )}

              {/* Info section: allergens · warnings · nutrition */}
              {(hasAllergens || hasNutrition || item.burn_calories_walking_minutes != null) && (
                <div className="mx-0 mt-6 bg-card rounded-3xl border border-border p-5 shadow-card space-y-5">
                  {item.burn_calories_walking_minutes != null && (
                    <div className="flex items-center gap-2 text-[13px] font-medium text-fg-muted">
                      <span>🚶</span><span>Walk {item.burn_calories_walking_minutes} min to burn this</span>
                    </div>
                  )}
                  {hasAllergens && (
                    <div>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-fg-muted">Allergens</p>
                      <div className="flex flex-wrap gap-2">
                        {item.allergens.map((a) => <span key={a} className="px-3 h-8 inline-flex items-center rounded-full bg-primary/10 text-primary font-bold" style={{ fontSize: 'var(--font-size-body, 11px)' }}>{a}</span>)}
                      </div>
                      <p className="mt-2 text-fg-muted" style={{ fontSize: 'var(--font-size-body, 11px)' }}>Please inform our server if you have any allergies.</p>
                    </div>
                  )}
                  {hasNutrition && (
                    <div>
                      <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-fg-muted">Nutrition</p>
                      <NutritionRow label="Serving Size" value={item.serving_size} />
                      <NutritionRow label="Calories" value={item.calories} unit="%" />
                      <NutritionRow label="Fat" value={item.fat} unit="%" />
                      <NutritionRow label="Sodium" value={item.sodium} unit="%" />
                      <NutritionRow label="Protein" value={item.protein} unit="%" />
                      <NutritionRow label="Calcium" value={item.calcium} unit="%" />
                      <NutritionRow label="Carbon" value={item.carbon_footprint} />
                    </div>
                  )}
                </div>
              )}

              {/* You may also like */}
              {ymayl.length > 0 && (
                <section className="mt-12">
                  <div className="px-5 flex items-end justify-between">
                    <h2 className="text-lg font-display font-black text-heading">You may also like</h2>
                    <button onClick={() => ymaylScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })} className="text-[11px] text-fg font-semibold active:text-primary transition-colors">Swipe →</button>
                  </div>
                  <div ref={ymaylScrollRef} className="mt-3 flex gap-3 overflow-x-auto no-scrollbar px-5 pb-2 snap-x">
                    {ymayl.map((r) => {
                      const rp = upsellPricing(r)
                      return (
                        <div key={r.id} className="snap-start shrink-0 w-40 rounded-2xl bg-card border border-border shadow-card overflow-hidden">
                          {r.image_url && <img src={r.image_url} alt={r.name} onError={onImgError} className="h-24 w-full object-cover" loading="lazy" />}
                          <div className="p-2.5">
                            <p className="text-[13px] font-bold leading-tight line-clamp-1 text-fg">{r.name}</p>
                            {rp.limited ? (
                              <p className="mt-0.5 flex items-baseline gap-1">
                                <span className="text-[11px] text-primary font-black">AED {rp.price}</span>
                                <span className="text-[10px] text-fg-muted font-bold line-through">AED {rp.original}</span>
                              </p>
                            ) : (
                              <p className="text-[11px] text-primary font-black mt-0.5">AED {rp.price}</p>
                            )}
                          </div>
                          <div className="px-2.5 pb-2.5">
                            <TouchButton onClick={() => handleUpsell(r)}
                              className={`w-full h-9 rounded-full text-secondary text-[11px] font-black tracking-wide flex items-center justify-center gap-1 active:scale-95 transition-colors ${addedUpsellId === r.id ? 'bg-emerald-600' : 'bg-primary'}`}>
                              {addedUpsellId === r.id ? '✓ Added' : <><Plus className="h-3.5 w-3.5" /> Add</>}
                            </TouchButton>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

      </div>

      {/* ── Customize bottom sheet (matches lovable's CustomizeSheet) ── */}
      <AnimatePresence>
        {showSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSheet(false)}
              className="fixed inset-0 z-[60] bg-primary/45 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-[2rem] shadow-float overflow-hidden flex flex-col max-h-[88vh]"
            >
              {/* Drag handle */}
              <div className="pt-2.5 flex flex-col items-center">
                <div className="h-1.5 w-12 rounded-full bg-border" />
              </div>

              {/* Sheet header */}
              <div className="flex items-center justify-between px-5 pt-2 pb-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-fg-muted font-bold">Customize</p>
                  <h2 
                    className="font-display italic font-black text-fg truncate"
                    style={{ fontSize: 'var(--font-size-heading, 20px)' }}
                  >
                    {item.name}
                  </h2>
                </div>
                <TouchButton onClick={() => setShowSheet(false)} aria-label="Close"
                  className="h-10 w-10 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform">
                  <X className="h-4 w-4" />
                </TouchButton>
              </div>

              {/* Sheet body */}
              <div className="px-5 pb-4 overflow-y-auto flex-1 space-y-5">
                {variants.map((g) => renderModifierGroup(g, 'variant'))}

                {hasSpiciness && (
                  <section>
                    <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg mb-2">Spice Level</h3>
                    <div className="flex gap-1.5 flex-wrap">
                      <span 
                        className="px-3 h-8 inline-flex items-center rounded-full bg-primary/10 text-primary font-bold"
                        style={{ fontSize: 'var(--font-size-body, 11px)' }}
                      >
                        {spiceOptions.find(o => o.value === selectedSpice)?.label || selectedSpice}
                      </span>
                    </div>
                  </section>
                )}

                {addons.map((g) => renderModifierGroup(g, 'addon'))}

                {warnings.length > 0 && (
                  <section>
                    <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg mb-2">Allergens</h3>
                    <div className="flex gap-2 flex-wrap">
                      {warnings.map((w) => (
                        <span 
                          key={w.id} 
                          className="rounded-full bg-red-500/10 px-3 py-1 font-bold text-red-500 border border-red-500/20"
                          style={{ fontSize: 'var(--font-size-body, 12px)' }}
                        >
                          {w.name}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Allergens in sheet */}
                {hasAllergens && (
                  <section>
                    <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg mb-2">Allergens</h3>
                    <div className="flex gap-1.5 flex-wrap">
                      {item.allergens.map((a) => (
                        <span 
                          key={a} 
                          className="px-3 h-8 inline-flex items-center rounded-full bg-primary/10 text-primary font-bold"
                          style={{ fontSize: 'var(--font-size-body, 11px)' }}
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-fg-muted" style={{ fontSize: 'var(--font-size-body, 11px)' }}>Please inform our server if you have any allergies.</p>
                  </section>
                )}

                {/* Quantity */}
                <section className="flex items-center justify-between">
                  <h3 className="text-[11px] uppercase tracking-[0.16em] font-black text-fg">Quantity</h3>
                  <div className="flex items-center gap-3">
                    <TouchButton onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease"
                      className="h-11 w-11 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform">
                      <Minus className="h-4 w-4" />
                    </TouchButton>
                    <span className="w-8 text-center font-display font-black text-xl text-fg">{quantity}</span>
                    <TouchButton onClick={() => setQuantity((q) => q + 1)} aria-label="Increase"
                      className="h-11 w-11 rounded-full bg-primary text-secondary flex items-center justify-center active:scale-90 transition-transform">
                      <Plus className="h-4 w-4" />
                    </TouchButton>
                  </div>
                </section>
              </div>

              {/* Sticky CTA footer */}
              <div className="px-5 py-4 border-t border-border bg-card/95 backdrop-blur flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-fg-muted font-bold">Total</p>
                  <p className="font-display font-black text-2xl text-primary leading-none mt-0.5">
                    AED {calculateTotal()}
                  </p>
                </div>
                <motion.div whileTap={{ scale: 0.96 }}>
                  <TouchButton
                    onClick={() => setShowConfirmAdd(true)}
                    disabled={!isValid()}
                    className="h-14 px-6 rounded-2xl bg-primary text-secondary font-bold text-sm shadow-float disabled:opacity-50"
                  >
                    Add to Order
                  </TouchButton>
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation Popup */}
      <AnimatePresence>
        {showConfirmAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-5 pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-card w-[98vw] max-w-[450px] rounded-3xl p-8 shadow-xl"
            >
              <h3 className="font-display font-bold text-xl text-heading text-center mb-6 leading-tight">Are u sure want to add this item in cart?</h3>
              <div className="flex gap-3">
                <TouchButton
                  onClick={() => setShowConfirmAdd(false)}
                  className="flex-1 h-12 rounded-2xl border border-border text-fg font-bold"
                >
                  No
                </TouchButton>
                <TouchButton
                  onClick={() => {
                    setShowConfirmAdd(false)
                    handleAddToCart()
                  }}
                  className="flex-1 h-12 rounded-2xl bg-primary text-secondary font-bold"
                >
                  Yes
                </TouchButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "You may also like" — configure variants/add-ons in the same sheet, then add */}
      {upsellSheetItem && (
        <QuickAddSheet
          item={upsellSheetItem}
          t={t}
          onClose={() => setUpsellSheetItem(null)}
          onAdded={(it) => { setUpsellSheetItem(null); if (onToast) onToast(it) }}
          source="upsell"
        />
      )}

      {/* Keep the bell + running-order pill reachable while viewing an item */}
      {onNavigate && (
        <FloatingWaiterCall
          current={JOURNEYS.MENU}
          onNavigate={(j) => { onClose?.(); onNavigate(j) }}
        />
      )}
      <CartSummaryBar t={t} onOpenCart={onOpenCart} />
    </motion.div>
  )
}

// ── State views ──────────────────────────────────────────────────────────────

const EmptyState = ({ t }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted border border-border">
      <ShoppingBag className="h-7 w-7 text-fg-muted" />
    </div>
    <p className="font-display text-[16px] font-bold text-fg">{t('empty.title')}</p>
    <p className="text-center text-[13px] text-fg-muted">{t('empty.message')}</p>
  </div>
)

// ── External menu (menu_type = none) ─────────────────────────────────────────
// The venue has no built menu. Either the admin uploaded menu images (shown as a
// slider; tapping opens a full-screen viewer to read them) OR gave a menu link
// (shown directly in an in-app iframe).

// Image mode — a single cover image on the landing. Tapping it opens the
// full-screen viewer where all menu pages can be swiped/zoomed.
const ExternalImageMenu = ({ images, onOpenViewer, t }) => (
  <div className="px-5 pt-4">
    <TouchButton
      onClick={() => onOpenViewer(0)}
      aria-label={t('external_menu.cta', { defaultValue: 'View menu' })}
      className="relative block w-full overflow-hidden rounded-[1.6rem] border border-border bg-card shadow-card active:scale-[0.99] transition-transform"
    >
      <img src={images[0]} alt="Menu" loading="lazy" className="w-full h-80 object-cover" />
      {images.length > 1 && (
        <span className="absolute top-3 right-3 rounded-full bg-black/70 px-3 py-1 text-[11px] font-black text-fg">
          1 / {images.length}
        </span>
      )}
      <div className="flex items-center justify-center gap-2 py-3 text-[13px] font-black uppercase tracking-wide text-primary">
        {t('external_menu.cta', { defaultValue: 'View menu' })}
        <ArrowRight className="h-4 w-4" />
      </div>
    </TouchButton>
  </div>
)

// Full-screen viewer (Zomato-style) — swipe between menu images + pinch /
// double-tap zoom (menus are text-heavy) + a "n / total" page counter.
const ExternalImageViewer = ({ images, startIndex, onClose, t }) => (
  <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex flex-col bg-black"
  >
    <div className="flex items-center justify-end px-4 py-3">
      <TouchButton
        onClick={onClose}
        aria-label={t('detail.close', { defaultValue: 'Close' })}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-soft active:scale-95 transition-transform"
      >
        <X className="h-5 w-5 text-fg" />
      </TouchButton>
    </div>
    <Swiper
      modules={[Zoom, Pagination, Keyboard]}
      initialSlide={startIndex ?? 0}
      zoom={{ maxRatio: 4, toggle: true }}
      pagination={{ type: 'fraction' }}
      keyboard
      spaceBetween={16}
      className="flex-1 w-full min-h-0 [&_.swiper-pagination-fraction]:text-fg [&_.swiper-pagination-fraction]:font-bold"
    >
      {images.map((src, i) => (
        <SwiperSlide key={i} className="flex items-center justify-center">
          {/* swiper-zoom-container is required for Swiper's pinch/double-tap zoom */}
          <div className="swiper-zoom-container h-full w-full">
            <img src={src} alt={`Menu ${i + 1}`} className="max-h-full max-w-full object-contain" />
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  </motion.div>
)

// Link mode — open the menu link directly. We don't embed it in an iframe:
// most sites block framing via X-Frame-Options / CSP frame-ancestors (which
// cannot be bypassed), which would just show a "refused to connect" error.
const ExternalLinkMenu = ({ url, t }) => {
  return (
    <div className="px-4 pb-4 flex flex-col gap-2">
      <div className="flex justify-end px-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-primary flex items-center gap-1 active:opacity-75 transition-opacity"
        >
          <span>Open in New Tab</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <iframe
        src={url}
        title="External Menu"
        className="w-full rounded-[1.5rem] border border-border bg-white shadow-soft"
        style={{ height: 'calc(100vh - 210px)' }}
        allow="autoplay; encrypted-media; fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"
      />
    </div>
  )
}

const ErrorState = ({ t, onRetry }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted border border-border">
      <AlertTriangle className="h-7 w-7 text-fg-muted" />
    </div>
    <p className="font-display text-[16px] font-bold text-fg">{t('error.title')}</p>
    <p className="text-center text-[13px] text-fg-muted">{t('error.message')}</p>
    <TouchButton onClick={onRetry} className="mt-2 rounded-full bg-primary px-6 py-3 text-[13px] font-semibold text-secondary shadow-soft active:bg-primary/80">
      {t('retry')}
    </TouchButton>
  </div>
)

const NoTableState = ({ t }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 border border-amber-300">
      <AlertTriangle className="h-7 w-7 text-amber-600" />
    </div>
    <p className="font-display text-[16px] font-bold text-fg">{t('no_table.title')}</p>
    <p className="text-center text-[13px] text-fg-muted">{t('no_table.message')}</p>
  </div>
)

// ── Upsell prompt ────────────────────────────────────────────────────────────
const UpsellCard = ({ item, onPick }) => {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <TouchButton
      onClick={() => onPick(item)}
      className="flex w-[140px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card text-left"
    >
      <div className="aspect-[4/3] w-full bg-muted">
        {item.image_url && !imgFailed ? (
          <img src={item.image_url} alt={item.name} loading="lazy" onError={() => setImgFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-cream">
            <span className="text-2xl font-black text-fg-muted/30">{item.name?.charAt(0) ?? '?'}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-2 font-display text-[12px] font-bold leading-tight text-fg">{item.name}</p>
        <p className="mt-auto text-[12px] font-bold text-primary">{formatPrice(item.price, item.currency)}</p>
      </div>
    </TouchButton>
  )
}

const UpsellPrompt = ({ items, t, onPick, onDismiss }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex flex-col justify-end bg-primary/40 backdrop-blur-sm"
    onClick={onDismiss}
  >
    <motion.div
      initial={{ y: 80 }}
      animate={{ y: 0 }}
      exit={{ y: 80 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="rounded-t-[2rem] border-t border-border bg-card px-5 pb-8 pt-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
      <h3 className="font-display text-[18px] font-black italic text-fg">{t('upsell.title')}</h3>
      <p className="mb-4 text-[13px] text-fg-muted">{t('upsell.subtitle')}</p>
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
        {items.map((it) => <UpsellCard key={it.id} item={it} onPick={onPick} />)}
      </div>
      <TouchButton onClick={onDismiss} className="mt-4 w-full rounded-full border border-border py-3 text-[14px] font-semibold text-fg-muted bg-muted active:bg-border">
        {t('upsell.no_thanks')}
      </TouchButton>
    </motion.div>
  </motion.div>
)

// ── Shared image helper (mirrors lovable menu-data.ts) ───────────────────────
const FOOD_FALLBACK = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80'
const onImgError = (e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = '1'; e.currentTarget.src = FOOD_FALLBACK } }

// ── Exclusive Offers carousel (configured in the admin panel) ────────────────

/** Perceived-luminance check so text/blob contrast adapts to the chosen colour. */
const hexIsDark = (hex) => {
  if (typeof hex !== 'string') return false
  const h = hex.replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return false
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140
}

const OffersCarousel = ({ offers = [], onSelect }) => {
  const scrollRef = useRef(null)

  // Nothing configured / active → hide the whole section.
  if (!Array.isArray(offers) || offers.length === 0) return null

  return (
    <div className="mt-4">
      <motion.div
        ref={scrollRef}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        className="mt-3 flex gap-4 overflow-x-auto no-scrollbar px-5 scroll-pl-5 pb-2 snap-x snap-mandatory"
      >
        {offers.map((o, i) => {
          const dark = hexIsDark(o.background_color)
          const lineColor = (cls) => (dark ? cls.dark : cls.light)
          const pct = o.discount_percentage != null ? Math.round(Number(o.discount_percentage)) : null
          const hasPromo = !!(o.top_line_text || o.middle_offer_text || o.bottom_line_text)
          const topText = o.top_line_text || (!hasPromo ? o.item_name : '')
          const midText = o.middle_offer_text || (!hasPromo && pct ? `${pct}% OFF` : '')
          const botText = o.bottom_line_text || ''

          return (
            <motion.div
              key={o.item_id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 200, damping: 22 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelect?.(o.item_id)}
              style={o.background_color ? { backgroundColor: o.background_color } : undefined}
              className={`snap-start shrink-0 w-[92%] min-[576px]:w-[60%] min-[600px]:w-[60%] relative text-left overflow-hidden rounded-[20px] cursor-pointer ${o.background_color ? '' : 'bg-gradient-peach'} flex items-center p-5 h-[160px]`}
            >
              {/* Left — text */}
              <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-center pr-[110px]">
                <div className="leading-tight [&_p]:m-0">
                  {topText && (
                    <div className={`text-[24px] font-bold line-clamp-1 ${lineColor({ dark: 'text-white/90', light: 'text-obsidian' })}`} dangerouslySetInnerHTML={renderSafeOfferHtml(topText)} />
                  )}
                  {midText && (
                    <div className={`font-display font-bold leading-none text-[33px] ${lineColor({ dark: 'text-white', light: 'text-[#D49842]' })}`} dangerouslySetInnerHTML={renderSafeOfferHtml(midText)} />
                  )}
                  {botText && (
                    <div className={`text-[15px] font-bold mt-1 leading-tight line-clamp-2 ${lineColor({ dark: 'text-white/80', light: 'text-obsidian/80' })}`} dangerouslySetInnerHTML={renderSafeOfferHtml(botText)} />
                  )}
                </div>
              </div>

              {/* Right — fixed image circle */}
              <div className="absolute right-[-40px] top-1/2 -translate-y-1/2 w-[190px] h-[190px]">
                {o.image_url ? (
                  <img
                    src={o.image_url}
                    alt=""
                    loading="lazy"
                    onError={onImgError}
                    className="w-full h-full object-cover rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.3)]"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-black/10 shadow-[0_8px_30px_rgb(0,0,0,0.3)]" />
                )}
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}

// ── Trending Now rail (uses API data) ───────────────────────────────────────────────
const TrendingRail = ({ items, onSelectItem, onSeeAll }) => {
  const scrollRef = useRef(null)

  if (!items || items.length === 0) return null

  return (
    <div className="mt-7">
      <div className="px-5 flex items-end justify-between">
        <h2 className="text-[20px] font-display font-black text-heading">You may also like</h2>
        <span className="text-xs font-medium text-fg">Swipe &rarr;</span>
      </div>
      <div ref={scrollRef} className="mt-4 flex gap-3 overflow-x-auto no-scrollbar pl-5 pb-4">
        {items.map((it, i) => {
          const available = it.is_available !== false
          const showImage = it.image_url

          return (
            <motion.div
              key={it.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 220, damping: 22 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelectItem(it)}
              className={`shrink-0 w-[145px] flex flex-col rounded-[20px] bg-white border border-[#F0F0F0] shadow-[0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden cursor-pointer ${!available ? 'opacity-50' : ''}`}
            >
              {showImage ? (
                <img
                  src={it.image_url}
                  alt={it.name}
                  loading="lazy"
                  className={`w-full h-[100px] object-cover ${!available ? 'grayscale' : ''}`}
                />
              ) : (
                <div className="w-full h-[110px] bg-gradient-cream" />
              )}

              <div className="p-2.5 flex flex-col flex-1 bg-white">
                <p className="text-[13px] font-bold leading-tight line-clamp-1 text-fg">{it.name}</p>
                <p className="text-[12px] font-bold mt-1 text-primary">
                  AED {displayPrice(it)}
                </p>

                <div className="mt-2 pt-1">
                  <button
                    disabled={!available}
                    onClick={(e) => { e.stopPropagation(); onSelectItem(it) }}
                    className="w-full h-[32px] rounded-full bg-primary text-secondary text-[12px] font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                  >
                    + Add
                  </button>
                </div>
              </div>
            </motion.div>
          )
        })}
        <div className="shrink-0 w-2" aria-hidden />
      </div>
    </div>
  )
}

// ── Categories List (Vertical layout with alternating sides) ─────────────────
const CategoriesList = ({ categories, onSelect }) => {
  // categories[0] is the synthetic "All" entry — show only real API categories
  const realCats = categories.slice(1)
  
  const rootRef = useRef(null)
  const scrollY = useMotionValue(0)
  const rotateImg = useTransform(scrollY, [0, 1000], [0, 360], { clamp: false })

  useEffect(() => {
    if (!rootRef.current) return
    let el = rootRef.current.parentElement
    let scrollEl = window
    while (el) {
      const overflow = window.getComputedStyle(el).overflowY
      if (overflow === 'auto' || overflow === 'scroll') {
        scrollEl = el
        break
      }
      el = el.parentElement
    }

    const handleScroll = (e) => {
      const target = e.target === document ? document.documentElement : e.target
      scrollY.set(target.scrollTop || window.scrollY || 0)
    }

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    if (scrollEl !== window) scrollY.set(scrollEl.scrollTop || 0)
    
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [scrollY])

  if (realCats.length === 0) return null

  return (
    <div ref={rootRef} className="mt-5 mb-10">
      {/*
      <div className="px-5 flex items-end justify-between mb-8">
        <h2 className="text-xl font-display font-black text-fg">Categories</h2>
        <p className="text-xs text-fg-muted">{realCats.length} to explore</p>
      </div>
      */}
      <div className="flex flex-col pb-6 category-section">
        {realCats.map((cat, idx) => {
          const catIndex = idx + 1
          const isEven = idx % 2 === 0
          const itemCount = collectSubcategories(cat).reduce((sum, s) => sum + (s.items?.length ?? 0), 0)
          const desc = cat.description || `${itemCount} items to explore`

          return (
            <motion.button
              key={cat.id}
              onClick={() => onSelect(catIndex)}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08, type: 'spring', stiffness: 200, damping: 22 }}
              whileTap={{ scale: 0.96 }}
              style={{ zIndex: realCats.length - idx }}
              className={`relative flex items-center w-full py-4 ${isEven ? 'pl-[45px] min-[415px]:pl-[80px] pr-5' : 'pl-5 pr-[45px] min-[415px]:pr-[80px]'}`}
            >
              {isEven ? (
                <>
                  <div className="shrink-0 pl-1 self-start mt-[30px]">
                    <div className="h-[42px] w-[42px] rounded-full shadow-md flex items-center justify-center bg-primary text-secondary">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="13" viewBox="0 0 23 15" fill="none" className="rotate-180">
                        <path d="M0.96875 7.2136H21.8286M14.0061 13.4585L21.8286 7.2136L14.0061 0.96875" stroke="currentColor" strokeOpacity={0.8} strokeWidth={1.9375} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                  <div className={`flex-1 flex flex-col self-start text-right pl-4 pr-6 ${idx === 0 ? 'pt-8' : 'pt-2'}`}>
                    <h3 
                      className="font-display font-bold leading-tight text-heading mb-1" 
                      style={{ color: cat.text_color || undefined, fontSize: 'var(--font-size-heading, 25px)' }}
                    >
                      {cat.name}
                    </h3>
                    <div className="text-[16px] text-fg leading-tight font-medium [&_p]:m-0 line-clamp-2 font-sans" dangerouslySetInnerHTML={renderSafeOfferHtml(desc)} />
                  </div>
                  <div className={`shrink-0 relative z-10 rounded-full category-item-img shadow-[0_12px_30px_rgb(0,0,0,0.2)] ${idx > 0 ? '-mt-16 -mb-6' : '-my-6'}`}>
                    <div className="w-[140px] h-[140px] min-[576px]:w-[200px] min-[576px]:h-[200px] min-[600px]:w-[220px] min-[600px]:h-[220px] rounded-full">
                      <div className="w-full h-full rounded-full animate-zoom-breathe">
                        {cat.image_url ? (
                          <motion.img style={{ rotate: rotateImg }} src={cat.image_url} alt={cat.name} loading="lazy" onError={onImgError} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <motion.div style={{ rotate: rotateImg, backgroundColor: cat.color || undefined }} className="w-full h-full rounded-full bg-gradient-cream flex items-center justify-center text-5xl font-black text-fg/20">
                            {cat.name?.charAt(0)?.toUpperCase() ?? '?'}
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className={`shrink-0 relative z-10 rounded-full category-item-img shadow-[0_12px_30px_rgb(0,0,0,0.2)] ${idx > 0 ? '-mt-16 -mb-6' : '-my-6'}`}>
                    <div className="w-[140px] h-[140px] min-[576px]:w-[200px] min-[576px]:h-[200px] min-[600px]:w-[220px] min-[600px]:h-[220px] rounded-full">
                      <div className="w-full h-full rounded-full animate-zoom-breathe">
                        {cat.image_url ? (
                          <motion.img style={{ rotate: rotateImg }} src={cat.image_url} alt={cat.name} loading="lazy" onError={onImgError} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <motion.div style={{ rotate: rotateImg, backgroundColor: cat.color || undefined }} className="w-full h-full rounded-full bg-gradient-cream flex items-center justify-center text-5xl font-black text-fg/20">
                            {cat.name?.charAt(0)?.toUpperCase() ?? '?'}
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col self-start pt-0 text-left pr-4 pl-6">
                    <h3 
                      className="font-display font-bold leading-tight text-heading mb-1" 
                      style={{ color: cat.text_color || undefined, fontSize: 'var(--font-size-heading, 25px)' }}
                    >
                      {cat.name}
                    </h3>
                    <div className="text-[16px] text-fg leading-tight font-medium [&_p]:m-0 line-clamp-2 font-sans" dangerouslySetInnerHTML={renderSafeOfferHtml(desc)} />
                  </div>
                  <div className="shrink-0 pr-1 self-start mt-[30px]">
                    <div className="h-[42px] w-[42px] rounded-full shadow-md flex items-center justify-center bg-primary text-secondary">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="13" viewBox="0 0 23 15" fill="none">
                        <path d="M0.96875 7.2136H21.8286M14.0061 13.4585L21.8286 7.2136L14.0061 0.96875" stroke="currentColor" strokeOpacity={0.8} strokeWidth={1.9375} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                </>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

// ── MenuScreen ───────────────────────────────────────────────────────────────
const MenuScreen = ({ onTitleDoubleClick, onNavigate }) => {
  const { t } = useTranslation('menu')
  const dispatch = useDispatch()

  const cartCount = useSelector(selectCartCount)
  const cartTotal = useSelector(selectCartTotal)
  const cartItems = useSelector(selectCartItems)
  const returnUrl = useSelector(selectReturnUrl)
  const sessionId = useSelector(selectSessionId)
  const { table } = useSelector(selectSession)
  const venueConfig = useSelector(selectVenueConfig)
  const logoUrl = useSelector(selectLogoUrl)
  const venueName = useSelector(selectVenueName)
  const noTableAssigned = useSelector(selectNoTableAssigned)
  const lastTapTime = useRef(0)

  const [menu, setMenu] = useState(null)
  const [fetchError, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [catView, setCatView] = useState(null)   // null = landing, category obj = items view
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedItemSource, setSelectedItemSource] = useState(null) // 'upsell' when opened from the upsell prompt
  const [quickAddItem, setQuickAddItem] = useState(null) // Add button → bottom sheet only
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(null) // external image viewer (null = closed)
  const [upsellItems, setUpsellItems] = useState([])
  const [toastInfo, setToastInfo] = useState(null)
  const [flyingItem, setFlyingItem] = useState(null)
  const [bounceCart, setBounceCart] = useState(false)
  // Holds the name of an item the backend rejected as unavailable, to drive the
  // "no longer available" popup.
  const [unavailableNotice, setUnavailableNotice] = useState(null)
  const [visibleCount, setVisibleCount] = useState(10)
  const observerRef = useRef(null)
  const screenRef = useRef(null)
  const isFromLanding = useRef(false)

  const resetScroll = useCallback(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    document.querySelectorAll('.overflow-y-auto').forEach((el) => { el.scrollTop = 0 })
    // Walk up from the screen root and reset every scrollable ancestor. This is
    // class-name independent, so it always hits the real scroll container (the
    // shell's overflow-y-auto wrapper) even if its markup changes.
    let el = screenRef.current?.parentElement
    while (el) {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = 0
      el = el.parentElement
    }
  }, [])

  // Callback ref for the category/specials view. Fires the instant the view's DOM
  // node mounts — which, under AnimatePresence mode="wait", is AFTER the landing
  // has finished exiting (the moment the catView effect can't catch). Reset every
  // scrollable ancestor from the node itself, then again next frame in case the
  // incoming content settles its layout one tick later.
  const catViewMountRef = useCallback((node) => {
    if (!node) return
    const reset = () => {
      window.scrollTo(0, 0)
      let el = node.parentElement
      while (el) {
        if (el.scrollHeight > el.clientHeight) el.scrollTop = 0
        el = el.parentElement
      }
    }
    reset()
    requestAnimationFrame(reset)
  }, [])

  useEffect(() => {
    setVisibleCount(10)
    resetScroll()
    const t1 = setTimeout(resetScroll, 50)
    const t2 = setTimeout(resetScroll, 100)
    const t3 = setTimeout(resetScroll, 200)
    const t4 = setTimeout(resetScroll, 400)
    const t5 = setTimeout(resetScroll, 600)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
    }
  }, [catView?.id, resetScroll])

  const sentinelRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (node) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(30, prev + 10))
        }
      }, { threshold: 0.1 })
      observer.observe(node)
      observerRef.current = observer
    }
  }, [])

  useEffect(() => {
    if (!toastInfo) return
    const timer = setTimeout(() => {
      setFlyingItem(toastInfo)
      setToastInfo(null)
      setTimeout(() => {
        setFlyingItem(null)
        setBounceCart(true)
        setTimeout(() => setBounceCart(false), 1000)
      }, 1500)
    }, 2000)
    return () => clearTimeout(timer)
  }, [toastInfo])

  const handleCategorySelect = (idx) => {
    isFromLanding.current = catView === null
    setCatView(categories[idx] ?? null)
  }

  const handleSeeAllSpecials = () => {
    isFromLanding.current = catView === null
    const title = t('trending') === 'trending' ? "Trending" : t('trending')
    setCatView({ id: 'specials', name: title, items: trendingItems.slice(0, 30) })
  }

  // ── Idle timeout ───────────────────────────────────────────────────────────
  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: 'menu', session_id: sessionId })
      returnToIdle({ return_url: returnUrl }, sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  // ── Category dwell ─────────────────────────────────────────────────────────
  const catDwellStartRef = useRef(null)
  useEffect(() => {
    if (!catView) return
    catDwellStartRef.current = Date.now()
    const categoryId = catView.id
    const categoryName = catView.name
    return () => {
      if (sessionId && catDwellStartRef.current) {
        logEvent({
          event_type: EVENT_TYPES.CATEGORY_DWELL,
          category_id: categoryId,
          category_name: categoryName,
          dwell_ms: Date.now() - catDwellStartRef.current,
          session_id: sessionId,
        })
      }
      catDwellStartRef.current = null
    }
  }, [catView?.id, sessionId])

  // ── Fetch menu ─────────────────────────────────────────────────────────────
  // Reads/writes the same 'menu' reference_cache key App.jsx's boot-time
  // prefetch populates — offline guests get the last-cached menu instead of
  // an error screen.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await cacheAndFetch('menu', async () => {
          const res = await pwaApiService.get('/pwa/menu')
          return res.data?.data ?? { categories: [] }
        })
        if (cancelled) return
        if (!data) { setError(true); return }
        setMenu(data)
        // Record the menu source so the cart knows if ordering is allowed
        // (AYC Menu Builder menus are view-only).
        dispatch(setMenuSource(data.source ?? null))
      } catch {
        if (!cancelled) setError(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [reloadKey])

  // ── Log page view ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    logEvent({ event_type: EVENT_TYPES.PAGE_VIEW, page: 'menu', session_id: sessionId })
    logEvent({ event_type: EVENT_TYPES.JOURNEY_START, journey: 'menu', session_id: sessionId })
  }, [sessionId])

  const handleRetry = () => { setMenu(null); setError(false); setReloadKey((k) => k + 1) }

  const categories = useMemo(() => {
    const all = Array.isArray(menu?.categories) ? menu.categories : []
    const filtered = all.filter((c) => collectSubcategories(c).some((s) => (s.items?.length ?? 0) > 0))
    const allItemsMap = new Map()
    filtered.forEach((c) => collectSubcategories(c).forEach((s) => (s.items || []).forEach((item) => { if (!allItemsMap.has(item.id)) allItemsMap.set(item.id, item) })))
    const uniqueItems = Array.from(allItemsMap.values())
    if (uniqueItems.length > 0) {
      return [{ id: 'all', name: t('all_categories'), image_url: null, items: uniqueItems }, ...filtered]
    }
    return filtered
  }, [menu, t])

  // Flat item lookup so the Exclusive Offers carousel can open the linked item.
  const itemById = useMemo(() => {
    const m = new Map()
    const all = Array.isArray(menu?.categories) ? menu.categories : []
    all.forEach((c) => collectSubcategories(c).forEach((s) => (s.items || []).forEach((it) => m.set(it.id, it))))
    return m
  }, [menu])

  const trendingItems = useMemo(() => {
    const all = Array.isArray(menu?.categories) ? menu.categories : []
    const allItemsMap = new Map()
    all.forEach((c) => {
      collectSubcategories(c).forEach((s) => {
        ; (s.items || []).forEach((item) => {
          if (!allItemsMap.has(item.id)) {
            allItemsMap.set(item.id, item)
          }
        })
      })
    })
    return Array.from(allItemsMap.values()).filter((item) => item.is_trending)
  }, [menu])

  // catView drives item display — derive activeIdx only for CategoriesMasonry highlight
  const activeIdx = catView ? Math.max(0, categories.findIndex((c) => c.id === catView.id)) : 0

  const handleTitleClick = () => {
    if (!onTitleDoubleClick) return
    const now = Date.now()
    if (now - lastTapTime.current < DOUBLE_TAP_MS) { lastTapTime.current = 0; onTitleDoubleClick() }
    else { lastTapTime.current = now }
  }

  const itemsById = useMemo(() => {
    const map = new Map()
    const cats = Array.isArray(menu?.categories) ? menu.categories : []
    cats.forEach((c) => collectSubcategories(c).forEach((s) => (s.items || []).forEach((it) => { if (!map.has(it.id)) map.set(it.id, it) })))
    return map
  }, [menu])

  const handleItemAdded = (item) => {
    setSelectedItem(null)
    setSelectedItemSource(null)
    setToastInfo({ name: item.name, image_url: item.image_url })
  }

  // The backend gate refused an item (its window/category just closed). Tell the
  // guest why, close any open sheet/modal, and pull a fresh menu so the stale
  // screen self-corrects without anyone manually refreshing the tablet.
  const handleItemUnavailable = (item) => {
    setQuickAddItem(null)
    setSelectedItem(null)
    setSelectedItemSource(null)
    setUnavailableNotice(item?.name ?? '')
    setReloadKey((k) => k + 1)
  }

  const handleCardIncrement = (item, e) => {
    e.stopPropagation()
    setQuickAddItem(item)
  }



  const handleSelectItem = (item, source) => {
    if (sessionId) logEvent({ event_type: EVENT_TYPES.ITEM_VIEWED, item_id: item.id, item_name: item.name, ...(source ? { source } : {}), session_id: sessionId })
    setSelectedItem(item)
    setSelectedItemSource(source ?? null)
  }

  const isLoading = menu === null && !fetchError
  // Items to render in the category view
  const catViewItems = catView
    ? collectSubcategories(catView).filter((s) => (s.items?.length ?? 0) > 0)
    : []

  // ── Shared cart button (used in both views) ─────────────────────────────────
  const CartBtn = () => {
    const currency = cartItems.length > 0 ? cartItems[0].currency : 'AED'
    return (
      <motion.div
        animate={bounceCart ? { scale: [1, 1.25, 0.85, 1.15, 0.95, 1.05, 1] } : { scale: 1 }}
        transition={{ duration: 0.8 }}
      >
        <TouchButton
          onClick={onNavigate ? () => onNavigate(JOURNEYS.CART) : () => setIsCartOpen(true)}
          aria-label="View cart"
          className={`relative h-12 rounded-full bg-primary shadow-soft flex items-center justify-center shrink-0 active:scale-95 transition-transform ${cartCount > 0 ? 'px-4 gap-2 min-w-[5.5rem]' : 'w-12'
            }`}
        >
          <ShoppingBag className="h-5 w-5 text-secondary" />
          {cartCount > 0 && (
            <span className="text-[13px] font-black text-secondary ml-0.5 whitespace-nowrap">
              {currency} {cartTotal}
            </span>
          )}
          <AnimatePresence>
            {cartCount > 0 && (
              <motion.span
                key={cartCount}
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-white shadow-sm text-primary text-[10px] font-black flex items-center justify-center"
              >
                {cartCount}
              </motion.span>
            )}
          </AnimatePresence>
        </TouchButton>
      </motion.div>
    )
  }

  return (
    <div ref={screenRef} className="relative min-h-full bg-background overflow-x-hidden">
      <div className="absolute -top-10 -right-20 h-64 w-64 blob-mask bg-blush/60 -z-10 animate-blob" />
      <div className="absolute top-32 -left-24 h-52 w-52 blob-mask-2 bg-peach/50 -z-10 animate-blob" style={{ animationDelay: '4s' }} />

      {/* ═══════════════════════════════════════════════════
          VIEW A — LANDING  (Offers + Categories + Trending)
          matches lovable /menu route
      ═══════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait" onExitComplete={resetScroll}>
        {!catView ? (
          <motion.div key="landing" onAnimationComplete={resetScroll}>

            {/* Landing header */}
            <header className="px-5 pt-5 pb-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-fg font-semibold select-none" onClick={handleTitleClick}>
                    {table ? `${table} · ${venueName ?? 'AYC Network'}` : (venueName ?? 'AYC Network')}
                  </p>
                  <h1 className="mt-1 text-[1.85rem] leading-[0.95] font-display font-black tracking-tight text-heading">
                    {t('heading_main', { defaultValue: 'What are you' })}<br />
                    <span className="italic">{t('heading_sub', { defaultValue: 'craving today?' })}</span>
                  </h1>
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-1">
                  <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45 }}
                    className="h-12 rounded-2xl bg-white border border-primary/20 shadow-md shadow-primary/20 flex items-center justify-center px-2.5">
                    <img src={logoUrl ?? aycLogo} alt={venueName ?? 'AYC'} className="h-10 w-auto max-w-[64px] object-contain" />
                  </motion.div>
                  <CartBtn />
                </div>
              </div>
            </header>

            {noTableAssigned ? (
              <NoTableState t={t} />
            ) : isLoading ? (
              <MenuLandingSkeleton />
            ) : (
              <>
                <div className="bg-cover bg-no-repeat w-full pt-1" style={{ backgroundImage: `url(${bgImage})`, backgroundPosition: 'center 32px' }}>
                  <OffersCarousel
                    offers={menu?.exclusive_offers ?? []}
                    onSelect={(itemId) => { const it = itemById.get(itemId); if (it) handleSelectItem(it) }}
                  />

                  {!fetchError && categories.length > 1 && (
                    <CategoriesList categories={categories} onSelect={handleCategorySelect} />
                  )}
                </div>

                <TrendingRail items={trendingItems.slice(0, 10)} onSelectItem={handleSelectItem} onSeeAll={handleSeeAllSpecials} />

                {fetchError && <ErrorState t={t} onRetry={handleRetry} />}
                {!fetchError && categories.length === 0 && (
                  menu?.external_menu_type === 'image' && menu?.external_menu_images?.length
                    ? <ExternalImageMenu images={menu.external_menu_images} onOpenViewer={setViewerIndex} t={t} />
                    : menu?.external_menu_type === 'link' && menu?.external_menu_url
                      ? <ExternalLinkMenu url={menu.external_menu_url} t={t} />
                      : <EmptyState t={t} />
                )}
                {/* Spacer for bottom floating bars */}
                <div className="h-15 shrink-0" />
              </>
            )}

          </motion.div>

        ) : (

          /* ═══════════════════════════════════════════════════
             VIEW B — CATEGORY ITEMS  (like lovable /menu/$cat)
          ═══════════════════════════════════════════════════ */
          <motion.div ref={catViewMountRef} key={catView.id} onAnimationComplete={resetScroll}>

            {/* Category header */}
            <header className="px-5 pt-3 pb-2 flex items-center gap-3">
              <TouchButton
                onClick={() => {
                  isFromLanding.current = false
                  setCatView(null)
                }}
                aria-label="Back"
                className="h-10 w-10 rounded-full bg-white border border-border shadow-soft flex items-center justify-center shrink-0 active:scale-95 transition-transform"
              >
                <ArrowLeft className="h-5 w-5 text-obsidian" />
              </TouchButton>
              <div className="flex-1 min-w-0">
                <h1 
                  className="font-display font-[700] leading-tight text-fg truncate"
                  style={{ fontSize: 'var(--font-size-heading, 24px)' }}
                >
                  {catView.name} ({catViewItems.reduce((s, sub) => s + (sub.items?.length ?? 0), 0)})
                </h1>
              </div>
              <CartBtn />
            </header>

            {/* Horizontal Category Tabs */}
            {categories.length > 1 && catView.id !== 'specials' && (
              <div className="w-full overflow-x-auto no-scrollbar pl-5 pb-3 pt-2 flex flex-nowrap gap-2">
                {categories.slice(1).map((cat, idx) => {
                  const isActive = cat.id === catView.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleCategorySelect(idx + 1)}
                      className="flex flex-col items-center gap-2 min-w-[90px] transition-transform active:scale-95 shrink-0"
                    >
                      <div
                        className={`relative w-20 h-20 rounded-full flex items-center justify-center bg-white border-[3px] transition-all p-[2px] ${isActive ? 'shadow-[0_6px_16px_rgba(0,0,0,0.15)]' : 'shadow-sm border-transparent'}`}
                        style={{ borderColor: isActive ? 'var(--color-primary)' : 'transparent' }}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-gradient-cream flex items-center justify-center">
                          {cat.image_url ? (
                            <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover animate-zoom-breathe" />
                          ) : (
                            <span className="text-xl font-black text-fg/20 animate-zoom-breathe" style={cat.color ? { color: cat.color } : undefined}>{cat.name?.charAt(0)}</span>
                          )}
                        </div>
                      </div>
                      <span
                        className="text-[12px] font-bold text-center leading-tight max-w-[80px] transition-colors"
                        style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-fg)' }}
                      >
                        {cat.name}
                      </span>
                    </button>
                  )
                })}
                {/* Right padding spacer for full-bleed scroll */}
                <div className="w-3 shrink-0" />
              </div>
            )}

            {/* 2-column item grid */}
            <div className="px-5 mt-3 pb-4">
              {isLoading
                ? <CategoryItemsSkeleton />
                : catViewItems.length === 0
                  ? <EmptyState t={t} />
                  : catViewItems.map((sub) => (
                    <section key={sub.id} className="mb-6">
                      {sub.name && (
                        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em] text-fg-muted">{sub.name}</h3>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        {(catView?.id === 'specials' ? sub.items.slice(0, visibleCount) : sub.items).map((item) => (
                          <ItemCard
                            key={item.id}
                            item={item}
                            t={t}
                            onSelect={handleSelectItem}
                            onIncrement={(e) => handleCardIncrement(item, e)}
                          />
                        ))}
                        {catView?.id === 'specials' && visibleCount < sub.items.length && (
                          <div ref={sentinelRef} className="col-span-2 py-4 flex justify-center">
                            <div className="flex space-x-2">
                              <div className="h-2.5 w-2.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                              <div className="h-2.5 w-2.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                              <div className="h-2.5 w-2.5 bg-primary rounded-full animate-bounce"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  ))
              }
              {/* Spacer for bottom floating bars */}
              <div className="h-15 shrink-0" />
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick-add sheet — opened by "Add" button, no full detail view */}
      <AnimatePresence>
        {quickAddItem && (
          <QuickAddSheet
            item={quickAddItem}
            t={t}
            onClose={() => setQuickAddItem(null)}
            onAdded={(item) => {
              setQuickAddItem(null)
              handleItemAdded(item)
            }}
            onUnavailable={handleItemUnavailable}
          />
        )}
      </AnimatePresence>

      {/* External menu image viewer (menu_type = none, image mode) — full-screen */}
      <AnimatePresence>
        {viewerIndex !== null && menu?.external_menu_images?.length > 0 && (
          <ExternalImageViewer
            images={menu.external_menu_images}
            startIndex={viewerIndex}
            onClose={() => setViewerIndex(null)}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* Item detail modal — overlays both views */}
      <AnimatePresence>
        {selectedItem && (
          <ItemDetailModal
            item={selectedItem}
            t={t}
            onClose={() => { setSelectedItem(null); setSelectedItemSource(null) }}
            onAdded={handleItemAdded}
            onUnavailable={handleItemUnavailable}
            onOpenCart={() => {
              setSelectedItem(null)
              setSelectedItemSource(null)
              if (onNavigate) onNavigate(JOURNEYS.CART)
              else setIsCartOpen(true)
            }}
            onNavigate={onNavigate}
            onToast={(it) => setToastInfo({ name: it.name, image_url: it.image_url })}
            itemsById={itemsById}
            menu={menu}
            catView={catView}
            categories={categories}
            source={selectedItemSource}
          />
        )}
      </AnimatePresence>

      {/* Upsell prompt */}
      <AnimatePresence>
        {!selectedItem && upsellItems.length > 0 && (
          <UpsellPrompt
            items={upsellItems}
            t={t}
            onPick={(it) => { setUpsellItems([]); handleSelectItem(it, 'upsell') }}
            onDismiss={() => setUpsellItems([])}
          />
        )}
      </AnimatePresence>

      {/* Cart bar + modal — navigate to CartScreen when onNavigate available */}
      {!selectedItem && !isCartOpen && (
        <CartSummaryBar
          t={t}
          onOpenCart={onNavigate ? () => onNavigate(JOURNEYS.CART) : () => setIsCartOpen(true)}
        />
      )}
      {/* Toast Notification */}
      <AnimatePresence>
        {toastInfo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed inset-0 z-[100] px-5 flex items-center justify-center pointer-events-none bg-white/50 backdrop-blur-[2px]"
          >
            <div className="bg-white rounded-[1.2rem] px-5 py-4 flex items-center gap-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-border pointer-events-auto max-w-[360px] w-full">
              <div className="h-8 w-8 rounded-full bg-primary text-secondary flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-black text-fg leading-tight">Added to order</p>
                <p className="text-[13px] text-fg-muted truncate leading-tight mt-0.5">{toastInfo.name}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Item-unavailable popup — shown when the backend gate refuses an add.
          The menu is refetched in the background so it self-corrects. */}
      <AnimatePresence>
        {unavailableNotice !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-5 pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-card w-[98vw] max-w-[450px] rounded-3xl p-8 shadow-xl text-center"
            >
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-red-100 text-red-500 flex items-center justify-center">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <h3 className="font-display font-bold text-xl text-heading leading-tight">
                {t('cart.item_no_longer_available', { defaultValue: 'This item is no longer available' })}
              </h3>
              {unavailableNotice && (
                <p className="mt-2 text-[14px] font-semibold text-fg-muted">{unavailableNotice}</p>
              )}
              <p className="mt-2 text-[13px] text-fg-muted">
                {t('cart.menu_refreshed', { defaultValue: 'The menu has been updated.' })}
              </p>
              <TouchButton
                onClick={() => {
                  // Drop back to the menu landing so the guest re-enters the
                  // category with the freshly-fetched menu — the stale item is
                  // gone instead of lingering in the open category view.
                  setUnavailableNotice(null)
                  setCatView(null)
                }}
                className="mt-6 w-full h-12 rounded-2xl bg-primary text-secondary font-bold"
              >
                {t('detail.close', { defaultValue: 'OK' })}
              </TouchButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flying Item Animation */}
      <AnimatePresence>
        {flyingItem && (
          <motion.div
            initial={{ opacity: 1, scale: 1, top: '50%', left: '50%', x: '-50%', y: '-50%' }}
            animate={{ 
              opacity: [1, 1, 0],
              scale: [1, 0.8, 0.1],
              top: '36px', 
              left: 'calc(100vw - 44px)',
              x: '-50%', y: '-50%' 
            }}
            transition={{ duration: 1.5, ease: [0.32, 0.72, 0, 1] }}
            className="fixed z-[250] pointer-events-none rounded-full shadow-lg overflow-hidden border-2 border-white bg-card"
            style={{ width: '120px', height: '120px' }}
          >
            {flyingItem.image_url ? (
              <img src={flyingItem.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary flex items-center justify-center text-secondary font-black text-xl">
                {flyingItem.name?.charAt(0)}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!onNavigate && isCartOpen && <CartModal t={t} onClose={() => setIsCartOpen(false)} />}
    </div>
  )
}

export default MenuScreen
