import { useSelector } from 'react-redux'
import { motion } from 'framer-motion'
import { UtensilsCrossed, BellRing, Wifi, Star, Gift } from 'lucide-react'
import { useTranslation } from '../../i18n/index'
import { JOURNEYS } from '../../constants/journeys'
import { selectPwaFeatures, selectVenueId } from '../../core/store/venueConfigSlice'
import TouchButton from '../touch/TouchButton'

const TABS = [
  { key: JOURNEYS.MENU,   labelKey: 'cta.menu',   Icon: UtensilsCrossed, flag: 'menu'        },
  { key: JOURNEYS.WAITER, labelKey: 'cta.waiter', Icon: BellRing,        flag: 'call_server' },
  { key: JOURNEYS.WIFI,   labelKey: 'cta.wifi',   Icon: Wifi,            flag: 'wifi'        },
  { key: JOURNEYS.REVIEW, labelKey: 'cta.review', Icon: Star,            flag: 'rating'      },
  { key: JOURNEYS.LEAD,   labelKey: 'cta.lead',   Icon: Gift,            flag: 'loyalty'     },
]

/**
 * BottomNav — floating pill navigation bar matching Lovable design.
 * Icons only (no text labels). Active tab shows a spring-animated red pill.
 */
const BottomNav = ({ current, onNavigate }) => {
  const { t } = useTranslation('home')
  const pwaFeatures = useSelector(selectPwaFeatures)
  const venueId = useSelector(selectVenueId)

  // Wait for the REAL device config (which carries venue_id + the actual
  // pwa_features) before rendering. The dev mock sets loaded=true early with
  // every feature defaulting on, so gating on venue_id avoids showing all tabs.
  if (!venueId) return null

  // Hide any tab whose admin "PWA Settings" toggle is off.
  const tabs = TABS.filter((tab) => pwaFeatures?.[tab.flag] !== false)

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 px-3 pb-4 pt-2">
      <div className="mx-auto max-w-[760px] bg-card border border-border rounded-full px-3 py-2.5 flex items-center justify-between">
        {tabs.map(({ key, labelKey, Icon }) => {
          const isActive = current === key
          return (
            <TouchButton
              key={key}
              onClick={() => onNavigate(key)}
              aria-label={t(labelKey)}
              className="relative flex-1 flex items-center justify-center py-2.5 rounded-full"
            >
              {isActive && (
                <motion.div
                  layoutId="navPill"
                  className="absolute inset-1 bg-primary rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <motion.div
                animate={{ scale: isActive ? 1.08 : 1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className="relative z-10"
              >
                <Icon
                  className={`h-7 w-7 transition-colors duration-200 ${
                    isActive ? 'text-secondary' : 'text-muted-foreground'
                  }`}
                />
              </motion.div>
            </TouchButton>
          )
        })}
      </div>
    </nav>
  )
}

export default BottomNav
