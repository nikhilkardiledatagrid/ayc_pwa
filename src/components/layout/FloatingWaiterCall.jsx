import { useSelector } from 'react-redux'
import { motion, AnimatePresence } from 'framer-motion'
import { BellRing } from 'lucide-react'
import { selectCartCount } from '../../core/store/cartSlice'
import { selectPwaFeatures, selectVenueId } from '../../core/store/venueConfigSlice'
import { JOURNEYS } from '../../constants/journeys'
import TouchButton from '../touch/TouchButton'

// Hide the floating button on these screens where it competes with primary CTAs
const HIDDEN_JOURNEYS = [
  JOURNEYS.WAITER,
  JOURNEYS.CART,
  JOURNEYS.DASHBOARD
]

const FloatingWaiterCall = ({ current, onNavigate }) => {
  const count = useSelector(selectCartCount)
  const pwaFeatures = useSelector(selectPwaFeatures)
  const venueId = useSelector(selectVenueId)

  // Wait for the REAL device config (carries venue_id) before showing the bell,
  // so it never flashes in before the actual call_server toggle is known.
  if (!venueId) return null
  // Hidden on competing screens, and when the admin Call-to-Server toggle is off.
  if (HIDDEN_JOURNEYS.includes(current)) return null
  if (pwaFeatures?.call_server === false) return null
  
  // Lift the button above the cart summary pill when it is visible
  // CartSummaryBar is around bottom 88px, so we need to clear it.
  const bottomClass = count > 0 && current === JOURNEYS.MENU ? "bottom-[150px]" : "bottom-28"

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={`fixed right-4 ${bottomClass} z-30 transition-[bottom] duration-300`}
      >
        <TouchButton
          onClick={() => onNavigate(JOURNEYS.WAITER)}
          aria-label="Call Waiter"
          className="h-14 w-14 rounded-full bg-primary shadow-float flex items-center justify-center text-white animate-pulse-ring border-[3px] border-white active:scale-95"
        >
          <BellRing className="h-6 w-6" />
        </TouchButton>
      </motion.div>
    </AnimatePresence>
  )
}

export default FloatingWaiterCall
