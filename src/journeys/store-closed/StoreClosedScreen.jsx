/**
 * StoreClosedScreen — task 7.19
 *
 * Shown when the venue's ordering system is unavailable (store closed,
 * KeyConnect down, or ordering feature disabled by venue config).
 *
 * Behaviour:
 *   - Displays venue branding + "We're closed" message
 *   - Shows all enabled non-ordering CTAs (WiFi, review, lead, game, waiter)
 *   - Arms idle timeout → returnToIdle() if guest never taps
 *   - Logs JOURNEY_START and CTA_TAPPED events via eventQueue
 *
 * onNavigate(key) is required — parent wires the CTA taps to the router.
 */

import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { motion } from 'framer-motion'
import { useTranslation } from '../../i18n/index'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectFeatures, selectPwaFeatures, selectReturnUrl, selectLogoUrl, selectVenueName } from '../../core/store/venueConfigSlice'
import { selectSessionId, selectSession } from '../../core/store/sessionSlice'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import TouchButton from '../../components/touch/TouchButton'
import aycLogo from '../../assets/ayc-logo.png'

// ── Icons ─────────────────────────────────────────────────────────────────────

const WifiIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.5 8.5a14 14 0 0 1 21 0" /><path d="M5 12.5a9 9 0 0 1 14 0" />
    <path d="M8.5 16.5a5 5 0 0 1 7 0" /><circle cx="12" cy="20" r="1" fill="currentColor" />
  </svg>
)

const ReviewIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const LeadIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
)

const GameIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 12h4m-2-2v4" /><circle cx="16" cy="10" r="1" fill="currentColor" /><circle cx="18" cy="12" r="1" fill="currentColor" /><circle cx="16" cy="14" r="1" fill="currentColor" /><circle cx="14" cy="12" r="1" fill="currentColor" />
  </svg>
)

const WaiterIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
    <line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
  </svg>
)

// CTA definitions — only non-ordering journeys are eligible
const ALT_CTAS = [
  { key: JOURNEYS.WIFI,   Icon: WifiIcon,   labelKey: 'cta.wifi',   iconBg: 'bg-info'    },
  { key: JOURNEYS.REVIEW, Icon: ReviewIcon, labelKey: 'cta.review', iconBg: 'bg-success' },
  { key: JOURNEYS.LEAD,   Icon: LeadIcon,   labelKey: 'cta.lead',   iconBg: 'bg-warning' },
  { key: JOURNEYS.GAME,   Icon: GameIcon,   labelKey: 'cta.game',   iconBg: 'bg-info'    },
  { key: JOURNEYS.WAITER, Icon: WaiterIcon, labelKey: 'cta.waiter', iconBg: 'bg-destructive' },
]

// CTA journey key → admin "PWA Settings" toggle key (venue_pwa_settings). Keys
// without a toggle (e.g. game) are always shown.
const CTA_FEATURE_FLAG = {
  [JOURNEYS.WIFI]:   'wifi',
  [JOURNEYS.REVIEW]: 'rating',
  [JOURNEYS.LEAD]:   'loyalty',
  [JOURNEYS.WAITER]: 'call_server',
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {{ onNavigate: (key: string) => void, onBack?: () => void }} props
 */
const StoreClosedScreen = ({ onNavigate, onBack }) => {
  const { t }      = useTranslation('store-closed')
  const features   = useSelector(selectFeatures)
  const pwaFeatures = useSelector(selectPwaFeatures)
  const returnUrl  = useSelector(selectReturnUrl)
  const sessionId  = useSelector(selectSessionId)
  const session    = useSelector(selectSession)
  const logoUrl    = useSelector(selectLogoUrl)
  const venueName  = useSelector(selectVenueName)

  const tableName  = session?.table ?? null

  // Filter to only enabled features (excluding ordering CTAs), and hide any whose
  // admin "PWA Settings" toggle is off.
  const activeCtas = ALT_CTAS.filter((c) => {
    if (!features[c.key]) return false
    const flag = CTA_FEATURE_FLAG[c.key]
    return !flag || pwaFeatures?.[flag] !== false
  })

  // Arm idle timeout
  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: 'store_closed', session_id: sessionId })
      returnToIdle({ return_url: returnUrl }, sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  // Log journey start
  useEffect(() => {
    if (!sessionId) return
    logEvent({ event_type: EVENT_TYPES.JOURNEY_START, journey: 'store_closed', session_id: sessionId })
  }, [sessionId])

  const handleCtaTap = async (ctaKey) => {
    if (sessionId) {
      await logEvent({ event_type: EVENT_TYPES.CTA_TAPPED, cta_type: ctaKey, session_id: sessionId })
    }
    onNavigate(ctaKey)
  }

  return (
    <div className="flex min-h-full flex-col bg-background overflow-x-hidden">

      {/* Ambient blobs */}
      <div className="absolute -top-10 -right-20 h-64 w-64 blob-mask bg-blush/60 -z-10 animate-blob pointer-events-none" />
      <div className="absolute top-40 -left-24 h-52 w-52 blob-mask-2 bg-peach/50 -z-10 animate-blob pointer-events-none" style={{ animationDelay: '5s' }} />

      {/* Back button — shown when caller provides onBack */}
      {onBack && (
        <div className="px-5 pt-4">
          <TouchButton
            onClick={onBack}
            aria-label="Go back"
            className="h-12 w-12 rounded-full bg-card border border-border shadow-soft flex items-center justify-center active:scale-95 transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </TouchButton>
        </div>
      )}

      {/* Hero section */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 pt-12 pb-6 text-center gap-5">

        {/* Venue logo */}
        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 22 }}
          className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-card border border-border shadow-card overflow-hidden"
        >
          <img
            src={logoUrl ?? aycLogo}
            alt={venueName ?? 'AYC Network'}
            className="h-16 w-auto object-contain"
          />
        </motion.div>

        {/* Closed badge */}
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 240, damping: 24 }}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/25 px-4 py-1.5 text-[11px] font-black tracking-widest text-primary uppercase"
        >
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          {t('closed_badge')}
        </motion.span>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 240, damping: 24 }}
          className="flex flex-col gap-2"
        >
          {venueName && (
            <p className="text-[12px] font-bold text-fg-muted uppercase tracking-widest">
              {venueName}{tableName ? ` · ${tableName}` : ''}
            </p>
          )}
          <h1 className="font-display font-black text-[1.75rem] leading-tight text-obsidian">
            {t('heading')}
          </h1>
          <p className="text-[14px] text-fg-muted max-w-[30ch] mx-auto leading-relaxed">
            {t('subheading')}
          </p>
        </motion.div>

      </div>

      {/* Alternate CTAs — only if any non-ordering features are enabled */}
      {activeCtas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 220, damping: 24 }}
          className="px-5 pb-10"
        >
          <p className="text-center text-[12px] font-semibold text-fg-muted uppercase tracking-widest mb-4">
            {t('alt_cta_prompt')}
          </p>

          <div className="grid grid-cols-3 gap-3">
            {activeCtas.map((cta, i) => (
              <motion.div
                key={cta.key}
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.06, type: 'spring', stiffness: 260, damping: 22 }}
              >
                <TouchButton
                  onClick={() => handleCtaTap(cta.key)}
                  className="flex flex-col items-center gap-2 w-full rounded-2xl bg-card border border-border shadow-card p-4 active:scale-95 transition-transform"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-white ${cta.iconBg}`}>
                    <cta.Icon />
                  </div>
                  <span className="text-[11px] font-bold text-fg text-center leading-tight">
                    {t(cta.labelKey)}
                  </span>
                </TouchButton>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

    </div>
  )
}

export default StoreClosedScreen
