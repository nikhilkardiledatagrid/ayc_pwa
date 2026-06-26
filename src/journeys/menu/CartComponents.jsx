import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronRight, X } from 'lucide-react';
import {
  selectCartCount,
  selectCartTotal,
  selectCartItems,
  updateQuantity,
  removeItem,
  repriceItems,
  clearCart
} from '../../core/store/cartSlice';
import { selectSessionId } from '../../core/store/sessionSlice';
import { logEvent } from '../../core/utils/eventQueue';
import { EVENT_TYPES } from '../../constants/events';
import { pwaApiService, safeFetch } from '../../core/api/pwaApiService';
import TouchButton from '../../components/touch/TouchButton';

// Utility for formatting price
const formatPrice = (price, currency = 'AED') => {
  const v = Number.isFinite(price) ? price : 0;
  const formattedVal = Number.isInteger(v) ? v.toString() : v.toFixed(2);
  return `${currency} ${formattedVal}`;
};

/**
 * CartSummaryBar
 * 
 * Sticky footer bar shown on the MenuScreen when the cart is not empty.
 * Tapping it opens the CartModal.
 */
export const CartSummaryBar = ({ t, onOpenCart }) => {
  const count = useSelector(selectCartCount);
  const total = useSelector(selectCartTotal);
  const items = useSelector(selectCartItems);
  const dispatch = useDispatch();

  const [isExpanded, setIsExpanded] = useState(true);
  const prevCount = useRef(count);
  const timerRef = useRef(null);

  // Auto-expand and set auto-collapse timer when count increases
  useEffect(() => {
    if (count > prevCount.current) {
      setIsExpanded(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 4000);
    }
    prevCount.current = count;
  }, [count]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (count === 0) return null;

  // Get up to 3 unique item images
  const uniqueImages = [];
  for (const item of items) {
    if (item.image_url && !uniqueImages.includes(item.image_url)) {
      uniqueImages.push(item.image_url);
      if (uniqueImages.length >= 3) break;
    }
  }

  // Helper to trigger expansion + auto-collapse timer
  const handleExpand = (e) => {
    e.stopPropagation();
    setIsExpanded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 4000);
  };

  return (
    <div className="fixed bottom-[88px] inset-x-0 z-30 px-5 max-w-[860px] mx-auto pointer-events-none flex justify-end">
      <motion.div
        layout
        animate={{
          width: isExpanded ? '100%' : '80px',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={isExpanded ? onOpenCart : handleExpand}
        className="h-14 rounded-full bg-primary text-secondary shadow-float flex items-center justify-center cursor-pointer select-none active:scale-[0.98] transition-transform relative overflow-hidden pointer-events-auto"
      >
        <AnimatePresence>
          {isExpanded ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-x-4 inset-y-0 flex items-center justify-between w-[calc(100%-32px)]"
            >
              <div className="flex items-center gap-3">
                {/* Red badge */}
                <div className="h-6 min-w-[24px] px-1.5 bg-primary text-secondary text-[11px] font-black rounded-full flex items-center justify-center shrink-0">
                  {count}
                </div>
                
                <div className="text-left leading-tight">
                  <p className="text-[13px] font-medium text-secondary">Your Order</p>
                  <p className="text-[11px] font-regular text-secondary">
                    {count} {count === 1 ? 'item' : 'items'} · AED {Number.isFinite(total) ? total.toFixed(0) : '0'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Item thumbnails overlapping */}
                {uniqueImages.length > 0 && (
                  <div className="flex items-center -space-x-3 mr-1 shrink-0">
                    {uniqueImages.map((imgUrl, idx) => (
                      <img
                        key={idx}
                        src={imgUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover border-2 border-white shrink-0 relative"
                        style={{ zIndex: uniqueImages.length - idx }}
                      />
                    ))}
                  </div>
                )}
                
                <ChevronRight className="h-5 w-5 text-secondary" />

                <div className="h-5 w-[1px] bg-white/20 mx-1 shrink-0" />

                <TouchButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                    if (timerRef.current) clearTimeout(timerRef.current);
                  }}
                  aria-label="Minimize order bar"
                  className="h-8 w-8 min-w-0 min-h-0 rounded-full flex items-center justify-center bg-white/10 active:bg-white/20 transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5 text-secondary" />
                </TouchButton>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="collapsed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex items-center justify-center gap-1.5"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-secondary">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <span className="text-[13px] font-black text-secondary leading-none">{count}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

/**
 * CartModal
 * 
 * Full-screen modal showing the selected items, allowing quantity updates and removal.
 */
export const CartModal = ({ t, onClose }) => {
  const dispatch = useDispatch();
  const items = useSelector(selectCartItems);
  const total = useSelector(selectCartTotal);
  const sessionId = useSelector(selectSessionId);

  const [placed, setPlaced] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState(null);

  const hasUnavailable = items.some((it) => it.unavailable);

  // Checkout — revalidate pricing on the backend FIRST (source of truth). Any
  // expired/inactive Limited Time Price is corrected server-side; we only place
  // the order when the backend confirms the prices the guest is seeing. Real
  // KeyConnect submission is task 7.16; for now a valid result clears the cart.
  const handleCheckout = async () => {
    setChecking(true);
    setNotice(null);

    const payload = {
      items: items.map((it) => ({
        id: it.originalId,
        quantity: it.quantity,
        base_price: Number.isFinite(it.basePrice) ? it.basePrice : it.price,
        modifier_total: it.modifierTotal ?? 0,
      })),
    };

    try {
      const res = await safeFetch(() => pwaApiService.post('/pwa/order/validate-pricing', payload), null);
      if (res === null) {                 // offline — safeFetch fired the offline event
        setNotice(t('cart.offline_retry', { defaultValue: 'You appear to be offline. Please try again.' }));
        return;
      }
      const data = res.data?.data;
      if (data && data.valid) {
        dispatch(clearCart());
        setPlaced(true);
      } else {
        // Prices changed — sync cart to the server's authoritative pricing and
        // make the guest review before they can check out.
        if (data?.items) dispatch(repriceItems({ lines: data.items }));
        setNotice(res.data?.message || t('cart.prices_changed', { defaultValue: 'Some prices changed. Please review your order.' }));
      }
    } catch {
      setNotice(t('cart.checkout_error', { defaultValue: 'Could not validate your order. Please try again.' }));
    } finally {
      setChecking(false);
    }
  };

  // Auto-close when the cart empties via item removal — but NOT while the
  // order-placed confirmation is showing. Done in an effect so we never call
  // setState (onClose) during render.
  useEffect(() => {
    if (!placed && items.length === 0) onClose();
  }, [items.length, placed, onClose]);

  // Order-placed confirmation screen
  if (placed) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#181818] px-8 text-center" role="dialog" aria-modal="true">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h2 className="font-display text-[22px] font-bold text-fg">
          {t('cart.order_placed_title', { defaultValue: 'Order placed!' })}
        </h2>
        <p className="text-[14px] text-fg-muted">
          {t('cart.order_placed_message', { defaultValue: 'Please collect your order at the counter.' })}
        </p>
        <TouchButton
          onClick={onClose}
          className="mt-4 rounded-2xl bg-primary px-8 py-4 font-display text-[16px] font-bold text-fg active:bg-primary/80"
        >
          {t('cart.done', { defaultValue: 'Done' })}
        </TouchButton>
      </div>
    );
  }

  if (items.length === 0) return null;  // the effect above handles closing

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#181818]" role="dialog" aria-modal="true">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-3 sm:px-8 sm:py-4">
        <span className="font-display text-[16px] sm:text-[18px] font-bold text-fg tracking-tight">
          {t('cart.title', { defaultValue: 'Your Order' })}
        </span>
        <TouchButton
          onClick={onClose}
          aria-label={t('cart.close', { defaultValue: 'Close' })}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-muted active:bg-elevated"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </TouchButton>
      </header>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          {items.map((item, index) => {
            // Calculate item subtotal including modifiers
            const itemTotal = item.price * item.quantity;
            
            return (
              <div key={`${item.id}-${index}`} className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-surface p-4">
                <div className="flex justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <span className="font-display text-[15px] font-bold text-fg line-clamp-2">{item.name}</span>
                    {item.isLimited && Number.isFinite(item.originalBasePrice) && item.originalBasePrice > (item.basePrice ?? 0) ? (
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {/* Original price first (struck through), then the active limited price. */}
                        <span className="relative inline-block text-[12px] font-semibold text-fg-muted">
                          {formatPrice(item.originalBasePrice, item.currency)}
                          <span className="absolute left-0 right-0 top-[52%] h-[1px] bg-current -translate-y-1/2" />
                        </span>
                        <span className="text-[14px] font-extrabold text-emerald-400">{formatPrice(item.basePrice, item.currency)}</span>
                        <span className="rounded-md border border-emerald-500/25 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-emerald-400">
                          {t('cart.limited')}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[13px] font-semibold text-primary mt-1.5">{formatPrice(item.basePrice || item.price, item.currency)}</span>
                    )}
                    {item.unavailable && (
                      <span className="mt-1.5 text-[11px] font-bold text-red-400">
                        {t('cart.item_unavailable')}
                      </span>
                    )}
                  </div>
                  <TouchButton
                    onClick={() => {
                      dispatch(removeItem(item.id))
                      logEvent({ event_type: EVENT_TYPES.CART_UPDATED, item_id: item.originalId, quantity: 0, session_id: sessionId })
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-muted hover:text-red-400 active:bg-elevated"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </TouchButton>
                </div>

                {/* Modifiers display */}
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-xl bg-elevated p-3">
                    {item.modifiers.map((mod, i) => (
                      <div key={i} className="flex justify-between text-[12px] text-fg-muted">
                        <span>{mod.name}</span>
                        {mod.price > 0 && <span>+{formatPrice(mod.price, item.currency)}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Quantity Controls & Subtotal */}
                <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-3">
                  <div className="flex items-center gap-4 rounded-full bg-elevated px-2 py-1">
                    <TouchButton
                      onClick={() => {
                        dispatch(updateQuantity({ itemId: item.id, quantity: item.quantity - 1 }))
                        logEvent({ event_type: EVENT_TYPES.CART_UPDATED, item_id: item.originalId, quantity: item.quantity - 1, session_id: sessionId })
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-fg active:bg-[#333]"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </TouchButton>
                    <span className="w-4 text-center text-[14px] font-bold text-fg">{item.quantity}</span>
                    <TouchButton
                      onClick={() => {
                        dispatch(updateQuantity({ itemId: item.id, quantity: item.quantity + 1 }))
                        logEvent({ event_type: EVENT_TYPES.CART_UPDATED, item_id: item.originalId, quantity: item.quantity + 1, session_id: sessionId })
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-fg active:bg-primary/80"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    </TouchButton>
                  </div>
                  <span className="font-display text-[16px] font-bold text-fg">{formatPrice(itemTotal, item.currency)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer / Checkout */}
      <footer className="shrink-0 border-t border-[var(--border)] bg-[#181818] p-5 sm:p-8">
        {notice && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] font-semibold text-amber-300">
            {notice}
          </div>
        )}
        <div className="mb-4 flex justify-between text-[16px]">
          <span className="text-fg-muted">{t('cart.total', { defaultValue: 'Total' })}</span>
          <span className="font-display font-bold text-fg">{formatPrice(total)}</span>
        </div>
        <TouchButton
          onClick={handleCheckout}
          disabled={checking || hasUnavailable}
          className={`w-full rounded-2xl py-4 text-center font-display text-[16px] font-bold text-fg shadow-lg ${checking || hasUnavailable ? 'bg-primary/40 opacity-60' : 'bg-primary active:bg-primary/80'}`}
        >
          {checking
            ? t('cart.checking', { defaultValue: 'Checking prices…' })
            : t('cart.checkout', { defaultValue: 'Proceed to Checkout' })}
        </TouchButton>
      </footer>
    </div>
  );
};
