import { useState, useEffect, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ShoppingBag, Plus, Minus, Trash2, Check, ShieldCheck, MessageCircle, BellRing } from 'lucide-react'
import { useTranslation } from '../../i18n/index'
import {
  selectCartItems,
  selectCartTotal,
  selectCartCount,
  updateQuantity,
  removeItem,
  repriceItems,
  clearCart,
  addItem,
} from '../../core/store/cartSlice'
import { pwaApiService, safeFetch, queuedPost } from '../../core/api/pwaApiService'
import { cacheAndFetch } from '../../core/utils/offlineCache'
import { checkItemAvailable } from '../../core/utils/orderGate'
import { resolveItemPricing } from '../../core/utils/pricing'
import { selectSession } from '../../core/store/sessionSlice'
import { selectReturnUrl, setMenuSource, selectCanPlaceOrder } from '../../core/store/venueConfigSlice'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import TouchButton from '../../components/touch/TouchButton'
import PageHeader from '../../components/layout/PageHeader'
import { QuickAddSheet, itemNeedsOptions } from '../menu/MenuScreen'

const STATE = {
  VIEW:       'view',
  CONFIRM:    'confirm',
  PLACING:    'placing',
  PLACED:     'placed',
  ORDER_INFO: 'order_info',
  WAITER_CALLED: 'waiter_called',
}

const formatPrice = (price, currency = 'AED') => {
  const v = Number.isFinite(price) ? price : 0
  const formattedVal = Number.isInteger(v) ? v.toString() : v.toFixed(2)
  return `${currency} ${formattedVal}`
}

// ── Confetti dots ─────────────────────────────────────────────────────────────
const Confetti = () =>
  Array.from({ length: 14 }).map((_, i) => (
    <span
      key={i}
      className="pointer-events-none absolute h-2 w-2 rounded-sm"
      style={{
        left:       `${(i * 7 + 5) % 90}%`,
        top:        '-10px',
        background: i % 2 ? 'var(--color-primary)' : 'var(--color-secondary)',
        animation:  `confetti-fall 2.${i}s linear ${i * 0.1}s 1`,
      }}
    />
  ))

// ── Upsell Card Component ─────────────────────────────────────────────────────
// "From" pricing applies limited-time discount + base-price-group resolution.
const upsellPricing = (item) => {
  const p = resolveItemPricing(item, {}, item.variant_groups ?? [], item.addon_groups ?? [])
  return { price: p.base, original: p.originalBase, limited: p.base < p.originalBase }
}

const UpsellCard = ({ item, onAdd }) => {
  const rp = upsellPricing(item)
  return (
    <div className="bg-card border border-border rounded-2xl p-3 flex flex-col items-center justify-between w-[120px] shrink-0 text-center shadow-card relative">
      <div className="w-14 h-14 rounded-full overflow-hidden border border-border bg-muted">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-cream flex items-center justify-center">
            <span className="text-sm font-black text-fg-muted/40">{item.name?.charAt(0) ?? '?'}</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] font-black leading-tight text-fg line-clamp-2 min-h-[28px]">{item.name}</p>
      {rp.limited ? (
        <p className="mt-1 flex flex-col items-center leading-none">
          <span className="text-[11px] font-black text-primary">{formatPrice(rp.price, item.currency)}</span>
          <span className="text-[9px] font-bold text-fg-muted line-through">{formatPrice(rp.original, item.currency)}</span>
        </p>
      ) : (
        <p className="mt-1 text-[11px] font-bold text-primary">{formatPrice(rp.price, item.currency)}</p>
      )}
      <TouchButton
        onClick={() => onAdd(item)}
        className="mt-2 h-7 w-7 rounded-full bg-obsidian text-white flex items-center justify-center active:scale-90 transition-transform"
      >
        <Plus className="h-4 w-4" />
      </TouchButton>
    </div>
  )
}

// ── Cart VIEW ─────────────────────────────────────────────────────────────────
const CartView = ({
  t,
  items,
  total,
  menu,
  onBack,
  onCheckout,
  priceNotice,
  name,
  setName,
  phone,
  setPhone,
  email,
  showErrors,
  setShowErrors,
  onCallWaiter
}) => {
  const dispatch   = useDispatch()
  const sessionId  = useSelector((s) => s.session.sessionId)
  const { table }  = useSelector(selectSession)
  const canPlaceOrder = useSelector(selectCanPlaceOrder)
  const { t: menuT } = useTranslation('menu')        // QuickAddSheet uses the menu namespace
  const [upsellSheetItem, setUpsellSheetItem] = useState(null)

  const itemsById = useMemo(() => {
    if (!menu) return new Map()
    const map = new Map()
    const cats = Array.isArray(menu.categories) ? menu.categories : []
    cats.forEach((c) => {
      const collect = (cat) => {
        const subs = Array.isArray(cat?.sub_category) ? cat.sub_category : []
        const orphanItems = Array.isArray(cat?.items) ? cat.items : []
        let results = [...subs]
        if (orphanItems.length > 0) {
          results.push({ id: `cat-${cat.id}-items`, items: orphanItems })
        }
        return results
      }
      collect(c).forEach((s) => {
        (s.items || []).forEach((it) => {
          if (!map.has(it.id)) map.set(it.id, it)
        })
      })
    })
    return map
  }, [menu])

  const upsellSuggestions = useMemo(() => {
    if (items.length === 0 || itemsById.size === 0) return []
    const suggestedIds = new Set()
    items.forEach(cartItem => {
      const originalItem = itemsById.get(cartItem.originalId || cartItem.id)
      if (originalItem && Array.isArray(originalItem.upsell_item_ids)) {
        originalItem.upsell_item_ids.forEach(id => {
          suggestedIds.add(id)
        })
      }
    })
    
    return Array.from(suggestedIds)
      .map(id => itemsById.get(id))
      .filter(Boolean)
      .filter(item => !items.some(cartItem => (cartItem.originalId || cartItem.id) === item.id))
  }, [items, itemsById])

  if (items.length === 0) {
    return (
      <div className="relative overflow-hidden">
        <PageHeader title={t('title')} onBack={onBack} showCart={false} />
        <div className="px-5 mt-12 text-center">
          <div className="relative mx-auto w-32 h-32">
            <div className="absolute inset-0 blob-mask bg-primary/15" />
            <div className="absolute inset-0 flex items-center justify-center">
              <ShoppingBag className="h-12 w-12 text-obsidian" />
            </div>
          </div>
          <h2 className="mt-6 text-2xl font-display italic font-black text-primary">{t('empty_heading')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('empty_message')}</p>
          <TouchButton
            onClick={onBack}
            className="mt-6 inline-flex items-center gap-2 bg-primary text-secondary rounded-full px-6 py-3 font-bold shadow-float"
          >
            {t('browse_menu')} <ArrowRight className="h-4 w-4" />
          </TouchButton>
        </div>
      </div>
    )
  }

  const subtitleParts = [table || null, `${items.length} ${items.length === 1 ? 'item' : 'items'}`].filter(Boolean)

  return (
    <div className="relative pb-6">
      <PageHeader
        title={t('title')}
        subtitle={subtitleParts.join(' · ')}
        onBack={onBack}
        showCart={true}
      />

      <div className="px-5 space-y-3">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="bg-card rounded-[1.4rem] p-3 flex gap-3 border border-border shadow-card relative"
            >
              {/* Trash button positioned absolutely at top right */}
              <div className="absolute top-2 right-2 z-10">
                <TouchButton
                  onClick={() => {
                    dispatch(removeItem(item.id))
                    if (sessionId) logEvent({ event_type: EVENT_TYPES.CART_UPDATED, item_id: item.originalId, quantity: 0, session_id: sessionId })
                  }}
                  aria-label={t('remove_label')}
                  className="h-10 w-10 min-h-0 min-w-0 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </TouchButton>
              </div>

              <div className="relative shrink-0 w-16 h-16 rounded-full overflow-hidden border border-border">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-cream flex items-center justify-center">
                    <span className="text-base font-black text-fg-muted/40">{item.name?.charAt(0) ?? '?'}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-display italic font-black text-base leading-tight text-fg line-clamp-2 pr-10 m-0">{item.name}</h3>
                {item.isLimited && Number.isFinite(item.originalBasePrice) && item.originalBasePrice > (item.basePrice ?? 0) && (() => {
                  const off = item.originalBasePrice - item.basePrice
                  const pct = item.originalBasePrice > 0 ? Math.round((off / item.originalBasePrice) * 100) : 0
                  const label = item.discountType === 'percentage'
                    ? `${pct}% off`
                    : `${formatPrice(off, item.currency)} off`
                  return (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-primary">
                      {t('exclusive_offer', { defaultValue: 'Exclusive Offer' })}
                      <span className="opacity-50">·</span>
                      <span className="normal-case">{label}</span>
                    </span>
                  )
                })()}

                {item.modifiers?.length > 0 && (() => {
                  const sorted = [...item.modifiers].sort((a, b) => {
                    const order = { variant: 1, spice: 2, addon: 3 }
                    return (order[a.type] || 99) - (order[b.type] || 99)
                  })
                  const names = sorted.map((m) => {
                    if (m.type === 'spice') {
                      return m.name.replace('Spice Level: ', '')
                    }
                    return m.name
                  })
                  const summary = names.length <= 2
                    ? names.join(' · ')
                    : `${names.slice(0, 2).join(' · ')} · +${names.length - 2}`
                  return (
                    <p className="text-[11px] text-fg-muted mt-0.5 font-medium">{summary}</p>
                  )
                })()}

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 bg-muted rounded-full p-1">
                    <TouchButton
                      onClick={() => {
                        dispatch(updateQuantity({ itemId: item.id, quantity: item.quantity - 1 }))
                        if (sessionId) logEvent({ event_type: EVENT_TYPES.CART_UPDATED, item_id: item.originalId, quantity: item.quantity - 1, session_id: sessionId })
                      }}
                      className="h-7 w-7 rounded-full bg-card flex items-center justify-center active:bg-border"
                    >
                      <Minus className="h-3 w-3 text-fg" />
                    </TouchButton>
                    <span className="text-sm font-bold w-5 text-center text-fg">{item.quantity}</span>
                    <TouchButton
                      onClick={() => {
                        dispatch(updateQuantity({ itemId: item.id, quantity: item.quantity + 1 }))
                        if (sessionId) logEvent({ event_type: EVENT_TYPES.CART_UPDATED, item_id: item.originalId, quantity: item.quantity + 1, session_id: sessionId })
                      }}
                      className="h-7 w-7 rounded-full bg-card flex items-center justify-center active:bg-border"
                    >
                      <Plus className="h-3 w-3 text-fg" />
                    </TouchButton>
                  </div>
                  {item.isLimited && Number.isFinite(item.originalBasePrice) && item.originalBasePrice > (item.basePrice ?? 0) ? (
                    <div className="text-right ml-4">
                      <p className="font-display font-black text-primary leading-none whitespace-nowrap">{formatPrice(item.price * item.quantity, item.currency)}</p>
                      <p className="relative inline-block text-[11px] font-bold text-fg-muted whitespace-nowrap">
                        {formatPrice(((item.originalBasePrice ?? 0) + (item.modifierTotal ?? 0)) * item.quantity, item.currency)}
                        <span className="absolute left-0 right-0 top-[52%] h-[1px] bg-current -translate-y-1/2" />
                      </p>
                    </div>
                  ) : (
                    <p className="font-display font-black text-primary whitespace-nowrap ml-4 text-right">{formatPrice(item.price * item.quantity, item.currency)}</p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {priceNotice && (
          <div className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-700">
            {priceNotice}
          </div>
        )}

        <TouchButton
          onClick={onBack}
          className="block w-full text-center py-3 rounded-full border-2 border-dashed border-border text-sm font-bold text-muted-foreground active:bg-muted"
        >
          {t('add_more')}
        </TouchButton>

        {/* Upsell suggestions section */}
        {upsellSuggestions.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-black text-obsidian mb-2.5">Add a little extra</h3>
            <div className="flex gap-3 overflow-x-auto pb-2.5 no-scrollbar">
              {upsellSuggestions.map((it) => (
                <UpsellCard
                  key={it.id}
                  item={it}
                  onAdd={async (item) => {
                    // Pop the sheet only when there are variants/add-ons to choose;
                    // otherwise add straight to the cart at the discounted price.
                    if (itemNeedsOptions(item)) { setUpsellSheetItem(item); return }
                    // Block-before-add: confirm the item is still orderable right now.
                    const gate = await checkItemAvailable(item.id)
                    if (!gate.available) return
                    const rp = upsellPricing(item)
                    dispatch(addItem({
                      id: `${item.id}-plain`,
                      originalId: item.id,
                      name: item.name,
                      basePrice: rp.price,
                      originalBasePrice: rp.original,
                      isLimited: rp.limited,
                      discountType: item.discount_type,
                      modifierTotal: 0,
                      price: rp.price,
                      quantity: 1,
                      currency: item.currency,
                      image_url: item.image_url,
                      modifiers: [],
                    }))
                    if (sessionId) logEvent({ event_type: EVENT_TYPES.ITEM_ADDED, item_id: item.id, item_name: item.name, quantity: 1, session_id: sessionId })
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Configure the upsell (variants/add-ons/spice) exactly like a normal item before adding */}
        {upsellSheetItem && (
          <QuickAddSheet
            item={upsellSheetItem}
            t={menuT}
            onClose={() => setUpsellSheetItem(null)}
            onAdded={() => setUpsellSheetItem(null)}
          />
        )}

        {/* User Details card */}
        <div className="mt-4 bg-primary/10 rounded-[2rem] p-6 border-0 shadow-sm space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-black text-[#3c2f2f] font-display">Your Details</h3>
              <span className="text-[12px] font-semibold text-[#8c7e7e]">optional</span>
            </div>
            <p className="text-[12px] text-[#6e5d53] mt-1 font-medium">
              Add details for order updates.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (showErrors && e.target.value.trim()) setShowErrors(false)
                }}
                className={`h-14 w-full px-6 bg-[#EFEFEF] border rounded-full text-[15px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary/10 text-input-text placeholder:text-[#888] ${
                  showErrors && !name.trim() ? 'border-destructive focus:ring-destructive' : 'border-border focus:border-primary/50'
                }`}
              />
              {showErrors && !name.trim() && (
                <p className="text-[11px] text-destructive font-bold mt-1.5 ml-5">Name is required to place your order</p>
              )}
            </div>

            <input
              type="tel"
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-14 w-full px-6 bg-[#EFEFEF] border border-border rounded-full text-[15px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary/10 text-input-text placeholder:text-[#888] focus:border-primary/50"
            />

            <input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 w-full px-6 bg-[#EFEFEF] border border-border rounded-full text-[15px] font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary/10 text-input-text placeholder:text-[#888] focus:border-primary/50"
            />
          </div>
        </div>

        {/* Order total */}
        <div className="mt-4 bg-card rounded-[1.4rem] p-4 border border-border shadow-card">
          <div className="flex justify-between text-sm text-muted-foreground"><span>{t('subtotal')}</span><span>{formatPrice(total)}</span></div>
          <div className="flex justify-between text-sm text-muted-foreground mt-1"><span>{t('service')}</span><span>{t('service_value')}</span></div>
          <div className="flex justify-between font-display font-black text-lg mt-2 pt-2 border-t border-border text-obsidian">
            <span>{t('total')}</span><span className="text-primary">{formatPrice(total)}</span>
          </div>
        </div>

        <div className="h-24" />
      </div>

      {/* Sticky CTA — order placement only exists for orderable (third-party /
          KeyConnect) menus. AYC Menu Builder menus use the Waiter CTA. */}
      {canPlaceOrder ? (
        <div className="fixed inset-x-0 bottom-[88px] z-30 px-5 max-w-[860px] mx-auto">
          <motion.div whileTap={{ scale: 0.98 }}>
            <TouchButton
              onClick={onCheckout}
              className="w-full h-14 rounded-full bg-gradient-to-r from-primary to-primary/80 text-white font-bold text-base shadow-float flex items-center justify-center gap-2"
            >
              {t('place_order')} · {formatPrice(total)} <ArrowRight className="h-5 w-5" />
            </TouchButton>
          </motion.div>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-[88px] z-30 px-5 max-w-[860px] mx-auto">
          <motion.div whileTap={{ scale: 0.98 }}>
            <TouchButton
              onClick={onCallWaiter}
              className="w-full h-14 rounded-full bg-[#EF4444] text-white font-bold text-base shadow-float flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <BellRing className="h-5 w-5" /> {t('call_waiter', { defaultValue: 'Call Server' })}
            </TouchButton>
          </motion.div>
        </div>
      )}
    </div>
  )
}

// ── CONFIRM ───────────────────────────────────────────────────────────────────
const ConfirmView = ({ t, items, total, table, onBack, onPlace }) => (
  <div>
    <PageHeader
      title={t('confirm_title')}
      subtitle={t('confirm_subtitle')}
      onBack={onBack}
      showCart={true}
    />
    <div className="px-5 space-y-3">
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-primary/10 rounded-3xl p-5 border border-primary/10 shadow-card flex items-center gap-3"
      >
        <div className="h-12 w-12 rounded-2xl bg-card flex items-center justify-center shadow-soft shrink-0">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          {table && <p className="text-sm font-bold">{table}</p>}
          <p className="text-xs text-muted-foreground">{t('confirm_kitchen_note')}</p>
        </div>
      </motion.div>

      <div className="bg-card rounded-3xl p-4 border border-border shadow-card divide-y divide-border">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{t('confirm_no_items')}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-gradient-cream flex items-center justify-center shrink-0">
                  <span className="text-base font-black text-fg-muted/40">{item.name?.charAt(0) ?? '?'}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate text-fg">{item.name}</p>
                <p className="text-xs text-muted-foreground">{t('qty_label')} {item.quantity}</p>
              </div>
              <p className="font-bold text-sm text-fg shrink-0">{formatPrice(item.price * item.quantity, item.currency)}</p>
            </div>
          ))
        )}
      </div>

      <div className="bg-card rounded-3xl p-4 border border-border shadow-card">
        <div className="flex justify-between font-display font-black text-lg text-obsidian">
          <span>{t('total')}</span>
          <span className="text-primary">{formatPrice(total)}</span>
        </div>
      </div>

      <div className="flex gap-3 pb-8">
        <TouchButton
          onClick={onBack}
          className="flex-1 h-13 py-4 rounded-full border border-border bg-card text-center font-semibold text-fg active:bg-muted"
        >
          {t('edit_order')}
        </TouchButton>
        <motion.div whileTap={{ scale: 0.97 }} className="flex-1">
          <TouchButton
            onClick={onPlace}
            className="w-full h-13 py-4 rounded-full bg-gradient-to-r from-primary to-primary/80 text-white font-bold shadow-float"
          >
            {t('confirm_place')}
          </TouchButton>
        </motion.div>
      </div>
    </div>
  </div>
)

// ── ORDER PLACED ──────────────────────────────────────────────────────────────
const PlacedView = ({ t, orderNumber, table, onOrderMore, onBackHome }) => (
  <div className="relative min-h-[80vh] flex flex-col items-center justify-center text-center px-6 pt-10 overflow-hidden">
    <Confetti />
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 14 }}
      className="h-24 w-24 rounded-full bg-gradient-to-r from-primary to-primary/80 flex items-center justify-center shadow-float"
    >
      <Check className="h-12 w-12 text-white" strokeWidth={3} />
    </motion.div>
    <h1 className="mt-6 text-3xl font-display font-black tracking-tight text-obsidian">{t('placed_heading')}</h1>
    <p className="mt-2 text-muted-foreground">{t('placed_message')}</p>

    <div className="mt-6 bg-card border border-border rounded-3xl p-5 shadow-card w-full max-w-sm">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{t('order_number_label')}</span>
        <span className="font-bold text-fg">{orderNumber}</span>
      </div>
      {table && (
        <div className="flex justify-between text-sm mt-2">
          <span className="text-muted-foreground">{t('table_label')}</span>
          <span className="font-bold text-fg">{table}</span>
        </div>
      )}
    </div>

    <div className="mt-8 flex gap-3 w-full max-w-sm">
      <TouchButton
        onClick={onOrderMore}
        className="flex-1 h-12 rounded-full border border-border bg-card flex items-center justify-center font-semibold text-fg active:bg-muted"
      >
        {t('order_more')}
      </TouchButton>
      <TouchButton
        onClick={onBackHome}
        className="flex-1 h-12 rounded-full bg-gradient-to-r from-primary to-primary/80 text-white flex items-center justify-center font-bold shadow-float"
      >
        {t('back_home')}
      </TouchButton>
    </div>
  </div>
)

// ── WAITER CALLED ─────────────────────────────────────────────────────────────
const WaiterCalledView = ({ t, waiterT, table, onBack, onCancel }) => {
  const ringColor = '#EF4444'
  return (
    <div className="relative min-h-[80vh] flex flex-col">
      <PageHeader
        title={t('title', { defaultValue: 'Your Order' })}
        subtitle={table ? `${table} · Waiter Called` : 'Waiter Called'}
        onBack={onBack}
        showCart={true}
      />
      <div className="px-5 mt-8 flex-1">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden w-full bg-obsidian text-white rounded-[2rem] p-8 text-center shadow-float">
          <div className="absolute -right-10 -top-10 h-40 w-40 blob-mask bg-primary/40 blur-2xl" />
          <div className="relative mx-auto h-20 w-20 flex items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-20" style={{ backgroundColor: ringColor }} />
            <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full opacity-10" style={{ backgroundColor: ringColor, animationDelay: '0.3s' }} />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${ringColor}33` }}>
              <BellRing className="h-8 w-8" style={{ color: ringColor }} />
            </div>
          </div>
          <p className="relative mt-5 font-display text-2xl font-black italic">
            {waiterT('waiting.waiter_heading', { defaultValue: 'Calling Server...' })}
          </p>
          <p className="relative mt-2 text-sm text-white/70">
            {waiterT('waiting.message', { defaultValue: 'Your request has been sent. A staff member will be with you shortly.' })}
          </p>
          <div className="relative mt-3 flex items-center justify-center gap-2 text-xs text-white/60">
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: ringColor }} />
            {waiterT('waiting.status', { defaultValue: 'Waiting for response' })}
          </div>
          <TouchButton
            onClick={onCancel}
            className="relative mt-5 w-full h-11 rounded-full bg-white/10 border border-white/20 text-white font-semibold text-sm active:bg-white/20"
          >
            {waiterT('waiting.cancel_label', { defaultValue: 'Cancel call' })}
          </TouchButton>
        </motion.div>
      </div>
    </div>
  )
}

// ── CartScreen (root journey component) ───────────────────────────────────────
const CartScreen = ({ onNavigate }) => {
  const { t }      = useTranslation('cart')
  const { t: waiterT } = useTranslation('waiter')
  const dispatch   = useDispatch()
  const items      = useSelector(selectCartItems)
  const total      = useSelector(selectCartTotal)
  const returnUrl  = useSelector(selectReturnUrl)
  const { sessionId, table } = useSelector(selectSession)

  const [screenState, setScreenState] = useState(STATE.VIEW)
  const [orderNumber, setOrderNumber]  = useState(null)
  const [priceNotice, setPriceNotice]  = useState(null)
  const [menu, setMenu] = useState(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [showErrors, setShowErrors] = useState(false)

  // Fetch menu to lookup upsells — same 'menu' reference_cache key App.jsx's
  // boot-time prefetch and MenuScreen.jsx populate/read, so this still works
  // offline as long as the device has loaded the menu at least once before.
  useEffect(() => {
    let cancelled = false
    const loadMenu = async () => {
      const data = await cacheAndFetch('menu', async () => {
        const res = await pwaApiService.get('/pwa/menu')
        return res.data?.data ?? null
      }).catch(() => null)
      if (cancelled || !data) return
      setMenu(data)
      dispatch(setMenuSource(data.source ?? null))
    }
    loadMenu()
    return () => { cancelled = true }
  }, [])

  // Idle timeout — applies to all cart states
  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: JOURNEYS.CART, session_id: sessionId })
      returnToIdle({ return_url: returnUrl }, sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  useEffect(() => {
    if (!sessionId) return
    logEvent({ event_type: EVENT_TYPES.PAGE_VIEW, page: JOURNEYS.CART, session_id: sessionId })
    logEvent({ event_type: EVENT_TYPES.JOURNEY_START, journey: JOURNEYS.CART, session_id: sessionId })
  }, [sessionId])

  const handlePlace = async () => {
    setScreenState(STATE.PLACING)
    setPriceNotice(null)

    // Revalidate pricing on the backend before placing — a limited price may have
    // expired since the items were added. The backend is the source of truth.
    const payload = {
      items: items.map((it) => ({
        id: it.originalId,
        quantity: it.quantity,
        base_price: Number.isFinite(it.basePrice) ? it.basePrice : it.price,
        modifier_total: it.modifierTotal ?? 0,
      })),
    }
    try {
      const res = await safeFetch(() => pwaApiService.post('/pwa/order/validate-pricing', payload), null)
      if (res === null) {
        setPriceNotice(t('offline_retry', { defaultValue: 'You appear to be offline. Please try again.' }))
        setScreenState(STATE.VIEW)
        return
      }
      const data = res.data?.data
      if (data && !data.valid) {
        // Prices changed — sync the cart and send the guest back to review.
        if (data.items) dispatch(repriceItems({ lines: data.items }))
        setPriceNotice(res.data?.message || t('prices_changed', { defaultValue: 'Some prices changed. Please review your order.' }))
        setScreenState(STATE.VIEW)
        return
      }
    } catch {
      setPriceNotice(t('checkout_error', { defaultValue: 'Could not validate your order. Please try again.' }))
      setScreenState(STATE.VIEW)
      return
    }

    const num = `AYC-${Math.floor(1000 + Math.random() * 9000)}`
    setOrderNumber(num)
    if (sessionId) {
      await logEvent({ event_type: EVENT_TYPES.JOURNEY_COMPLETE, journey: JOURNEYS.CART, session_id: sessionId })
    }
    dispatch(clearCart())
    setScreenState(STATE.PLACED)
  }

  const handleBackToMenu = () => onNavigate ? onNavigate(JOURNEYS.MENU) : null

  if (screenState === STATE.PLACING) {
    return (
      <div className="flex flex-1 items-center justify-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (screenState === STATE.PLACED) {
    return (
      <PlacedView
        t={t}
        orderNumber={orderNumber}
        table={table}
        onOrderMore={handleBackToMenu}
        onBackHome={() => returnToIdle({ return_url: returnUrl }, sessionId, 'journey_complete')}
      />
    )
  }

  if (screenState === STATE.CONFIRM) {
    return (
      <ConfirmView
        t={t}
        items={items}
        total={total}
        table={table}
        onBack={() => setScreenState(STATE.VIEW)}
        onPlace={handlePlace}
      />
    )
  }

  if (screenState === STATE.WAITER_CALLED) {
    return (
      <WaiterCalledView
        t={t}
        waiterT={waiterT}
        table={table}
        onBack={() => setScreenState(STATE.VIEW)}
        onCancel={async () => {
          try {
            await pwaApiService.delete('/pwa/waiter-call')
            if (sessionId) {
              logEvent({ event_type: EVENT_TYPES.WAITER_CALL_CANCELLED, session_id: sessionId })
            }
          } catch (e) {
            console.error(e)
          }
          setScreenState(STATE.VIEW)
        }}
      />
    )
  }

  const handleCheckout = () => {
    if (!name.trim()) {
      setShowErrors(true)
      return
    }
    setScreenState(STATE.CONFIRM)
  }

  return (
    <CartView
      t={t}
      items={items}
      total={total}
      menu={menu}
      onBack={handleBackToMenu}
      onCheckout={handleCheckout}
      onCallWaiter={async () => {
        setScreenState(STATE.WAITER_CALLED)
        await queuedPost('/pwa/waiter-call', { session_id: sessionId })
        if (sessionId) {
          logEvent({ event_type: EVENT_TYPES.WAITER_CALLED, session_id: sessionId })
        }
      }}
      priceNotice={priceNotice}
      name={name}
      setName={setName}
      phone={phone}
      setPhone={setPhone}
      email={email}
      setEmail={setEmail}
      showErrors={showErrors}
      setShowErrors={setShowErrors}
    />
  )
}

export default CartScreen
