import { ArrowLeft, ShoppingBag } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSelector } from 'react-redux'
import { selectCartCount, selectCartTotal, selectCartItems } from '../../core/store/cartSlice'
import TouchButton from '../touch/TouchButton'

/**
 * PageHeader — reusable top header matching the Lovable design.
 *
 * Layout: [Back btn?] [Title + Subtitle] [Cart badge?]
 * Blob decorations are positioned inside the header (top-left peach, top-right blush).
 *
 * @param {string}   title        — main heading (required)
 * @param {string}   subtitle     — small uppercase text below title (optional)
 * @param {Function} onBack       — if provided, shows the back button
 * @param {Function} onCartPress  — if provided, makes the cart icon tappable
 * @param {boolean}  showCart     — show/hide cart icon (default true)
 */
const PageHeader = ({ title, subtitle, onBack, onCartPress, showCart = true }) => {
  const cartCount = useSelector(selectCartCount)
  const cartTotal = useSelector(selectCartTotal)
  const cartItems = useSelector(selectCartItems)
  const currency = cartItems.length > 0 ? cartItems[0].currency : 'AED'

  return (
    <header className="relative px-5 pt-3 pb-3">
      {/* Organic blob decorations */}
      <div className="absolute -top-6 -left-10 h-40 w-40 blob-mask bg-peach/70 -z-10" />
      <div className="absolute -top-4 right-0 h-24 w-24 rounded-full bg-blush/60 -z-10" />

      <div className="flex items-center gap-3">
        {onBack && (
          <TouchButton
            onClick={onBack}
            aria-label="Back"
            className="h-10 w-10 rounded-full bg-white border border-border shadow-soft flex items-center justify-center shrink-0 active:scale-95 transition-transform"
          >
            <ArrowLeft className="h-5 w-5 text-obsidian" />
          </TouchButton>
        )}

        <div className="flex-1 min-w-0">
          <h1 
            className="leading-tight font-display font-black tracking-tight text-obsidian truncate"
            style={{ fontSize: 'var(--font-size-heading, 1.5rem)' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] uppercase tracking-[0.16em] text-fg-muted font-semibold mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>

        {showCart && (
          onCartPress ? (
            <TouchButton
              onClick={onCartPress}
              aria-label="View cart"
              className={`relative h-12 rounded-full bg-primary shadow-soft flex items-center justify-center shrink-0 active:scale-95 transition-transform ${
                cartCount > 0 ? 'px-4 gap-2 min-w-[5.5rem]' : 'w-12'
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
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-white text-primary text-[10px] font-black flex items-center justify-center shadow-sm"
                  >
                    {cartCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </TouchButton>
          ) : (
            <div
              className={`relative h-12 rounded-full bg-primary shadow-soft flex items-center justify-center shrink-0 select-none ${
                cartCount > 0 ? 'px-4 gap-2 min-w-[5.5rem]' : 'w-12'
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
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-white text-primary text-[10px] font-black flex items-center justify-center shadow-sm"
                  >
                    {cartCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          )
        )}
      </div>
    </header>
  )
}

export default PageHeader
