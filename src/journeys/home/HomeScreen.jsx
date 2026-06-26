import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSession, upgradeSession } from '../../core/utils/sessionManager'
import { logEvent } from '../../core/utils/eventQueue'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { getDeviceParams } from '../../core/utils/urlParams'
import { getDeviceConfig, getDeviceId } from '../../core/utils/deviceConfig'
import { useTranslation } from '../../i18n/index'
import { JOURNEYS } from '../../constants/journeys'
import { EVENT_TYPES } from '../../constants/events'
import {
  setSession,
  upgradeToEngaged,
  selectSessionId,
  selectSessionType,
} from '../../core/store/sessionSlice'
import {
  selectVenueConfig,
  selectFeatures,
  selectPwaFeatures,
  selectReturnUrl,
  selectSessionTtlMs,
} from '../../core/store/venueConfigSlice'
import TouchButton from '../../components/touch/TouchButton'

// ── SVG icons ─────────────────────────────────────────────────────────────────

const MenuIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3h18v4H3z" /><path d="M3 10h18v4H3z" /><path d="M3 17h18v4H3z" />
  </svg>
)

const WifiIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 8.5a14 14 0 0 1 21 0" /><path d="M5 12.5a9 9 0 0 1 14 0" />
    <path d="M8.5 16.5a5 5 0 0 1 7 0" /><circle cx="12" cy="20" r="1" fill="currentColor" />
  </svg>
)

const LoyaltyIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
)

const ReviewIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)


const WaiterIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
    <line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
  </svg>
)

// ── CTA definitions — label keys resolved from home.json at render time ───────

const CTA_DEFINITIONS = [
  { key: JOURNEYS.MENU,   labelKey: 'cta.menu',   Icon: MenuIcon,    iconBg: 'bg-brand'      },
  { key: JOURNEYS.WIFI,   labelKey: 'cta.wifi',   Icon: WifiIcon,    iconBg: 'bg-info'       },
  { key: JOURNEYS.REVIEW, labelKey: 'cta.review', Icon: ReviewIcon,  iconBg: 'bg-success'    },
  { key: JOURNEYS.LEAD,   labelKey: 'cta.lead',   Icon: LoyaltyIcon, iconBg: 'bg-warning'    },
  { key: JOURNEYS.WAITER, labelKey: 'cta.waiter', Icon: WaiterIcon,  iconBg: 'bg-[#EF4444]' },
]

// CTA journey key → admin "PWA Settings" toggle key (venue_pwa_settings).
// A CTA is hidden when its admin toggle is explicitly off.
const CTA_FEATURE_FLAG = {
  [JOURNEYS.MENU]:   'menu',
  [JOURNEYS.WIFI]:   'wifi',
  [JOURNEYS.REVIEW]: 'rating',
  [JOURNEYS.LEAD]:   'loyalty',
  [JOURNEYS.WAITER]: 'call_server',
}

// ── Connecting screen ─────────────────────────────────────────────────────────

const ConnectingScreen = () => {
  const { t } = useTranslation('common')
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#181818]">
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2.5 w-2.5 rounded-full bg-brand animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <p className="text-[13px] text-fg-muted">{t('connecting')}</p>
      </div>
    </div>
  )
}

// ── No features screen ────────────────────────────────────────────────────────

const NoFeaturesScreen = () => {
  const { t } = useTranslation('common')
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#181818]">
      <p className="text-[13px] text-fg-muted">{t('no_features')}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * HomeScreen — Guest Entry screen with bottom navigation bar.
 *
 * Layout:
 *   - Header:     brand name + table number
 *   - Hero:       venue branding + welcome text (flex-1, fills height)
 *   - Bottom nav: one touch button per enabled CTA (evenly distributed)
 *
 * All strings from i18n lang files. All keys from constants/.
 *
 * @param {{ onNavigate: (key: string) => void }} props
 */
const HomeScreen = ({ onNavigate }) => {
  const { t: th } = useTranslation('home')
  const { t: tc } = useTranslation('common')

  const dispatch        = useDispatch()
  const features        = useSelector(selectFeatures)
  const pwaFeatures     = useSelector(selectPwaFeatures)
  const venueConfig     = useSelector(selectVenueConfig)
  const returnUrl       = useSelector(selectReturnUrl)
  const sessionId       = useSelector(selectSessionId)
  const sessionType     = useSelector(selectSessionType)
  const sessionTtlMs    = useSelector(selectSessionTtlMs)
  const sessionStarting = useRef(false)

  // Show a CTA only when the venue supports it AND the admin toggle is on.
  const activeCtas = CTA_DEFINITIONS.filter((c) => {
    if (!features[c.key]) return false
    const flag = CTA_FEATURE_FLAG[c.key]
    return !flag || pwaFeatures?.[flag] !== false
  })

  // Arm idle timeout — returnToIdle if guest never interacts
  useEffect(() => {
    startTimeout('session_idle_ms', () => returnToIdle({ return_url: returnUrl }, sessionId))
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  const handleCtaTap = async (ctaKey) => {
    if (sessionStarting.current) return

    let activeSessionId = sessionId

    if (!activeSessionId) {
      sessionStarting.current = true
      try {
        const params = getDeviceParams()
        const cfg    = getDeviceConfig()
        // createSession() -> initSession() logs SESSION_START itself when it
        // actually creates a new session (not on resume).
        const newId  = await createSession({ ...params, sessionTtlMs })
        dispatch(setSession({
          sessionId: newId,
          venueId:   cfg?.venue_id ?? null,
          screenId:  getDeviceId(),
          table:     params.table,
          scenario:  params.scenario,
        }))
        activeSessionId = newId
      } catch {
        // Backend not yet ready — use local UUID and continue
        const params     = getDeviceParams()
        const fallbackId = crypto.randomUUID()
        dispatch(setSession({
          sessionId: fallbackId,
          venueId:   getDeviceConfig()?.venue_id ?? null,
          screenId:  getDeviceId(),
          table:     params.table,
          scenario:  params.scenario,
        }))
        await logEvent({ event_type: EVENT_TYPES.SESSION_START, session_id: fallbackId })
        activeSessionId = fallbackId
      } finally {
        sessionStarting.current = false
      }
    }

    // Upgrade ambient → engaged on first guest touch.
    // Runs for both new sessions and resumed sessions — sessionType guards against repeat calls.
    if (sessionType === 'ambient') {
      dispatch(upgradeToEngaged())
      try {
        await upgradeSession(activeSessionId)
        await logEvent({ event_type: EVENT_TYPES.SESSION_UPGRADE, session_id: activeSessionId })
      } catch {
        // non-fatal — fallback sessions have no backend row to upgrade
      }
    }

    await logEvent({
      event_type: EVENT_TYPES.CTA_TAPPED,
      cta_type:   ctaKey,
      session_id: activeSessionId,
    })

    onNavigate(ctaKey)
  }

  if (!venueConfig.loaded)     return <ConnectingScreen />
  if (activeCtas.length === 0) return <NoFeaturesScreen />

  const deviceParams  = getDeviceParams()
  const venueName     = venueConfig.branding?.venue_name
  const heroTitle     = venueName
    ? tc('welcome_to', { venue_name: venueName })
    : tc('welcome')

  return (
    <div className="flex h-screen w-screen flex-col bg-[#181818] overflow-hidden">

      {/* ── Header ── */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-3 sm:px-8 sm:py-4">
        <span className="font-display text-[14px] sm:text-[16px] font-bold text-fg tracking-tight">
          {th('header.brand')}
        </span>
        {deviceParams.table && (
          <span className="rounded-full bg-elevated px-3 py-1 text-[11px] sm:text-[12px] font-medium text-fg-muted">
            {tc('table', { number: deviceParams.table })}
          </span>
        )}
      </header>

      {/* ── Hero ── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8 sm:gap-5 sm:py-12">
        {venueConfig.branding?.logo_url && (
          <img
            src={venueConfig.branding.logo_url}
            alt={venueName ?? th('header.brand')}
            className="mb-2 h-14 w-auto object-contain sm:h-20"
          />
        )}
        <h1 className="font-display text-[22px] sm:text-[30px] font-bold text-fg text-center leading-tight">
          {heroTitle}
        </h1>
        <p className="text-[13px] sm:text-[15px] text-fg-muted text-center">
          {tc('get_started')}
        </p>
      </div>

      {/* ── Bottom nav bar ── */}
      <nav className="shrink-0 border-t border-[var(--border)] bg-elevated">
        <div className="flex">
          {activeCtas.map((cta) => (
            <TouchButton
              key={cta.key}
              onClick={() => handleCtaTap(cta.key)}
              className="flex flex-1 flex-col items-center justify-center gap-1.5 py-4 sm:py-5 min-h-[72px] sm:min-h-[88px]"
            >
              <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl text-white ${cta.iconBg}`}>
                <cta.Icon />
              </div>
              <span className="text-[10px] sm:text-[12px] font-semibold text-fg text-center leading-tight">
                {th(cta.labelKey)}
              </span>
            </TouchButton>
          ))}
        </div>
      </nav>

    </div>
  )
}

export default HomeScreen
