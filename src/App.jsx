import { useState, useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setVenueConfig, setDeviceTables, setNoTableAssigned, selectPwaFeatures, selectVenueId } from './core/store/venueConfigSlice'
import { useTranslation } from './i18n/index'
import { setSession } from './core/store/sessionSlice'
import { configureTimeouts } from './core/utils/timeoutManager'
import { applyVenueTheme } from './core/utils/applyVenueTheme'
import { isDeviceConfigured, getDeviceId } from './core/utils/deviceConfig'
import { getDeviceParams } from './core/utils/urlParams'
import { initSession } from './core/utils/sessionManager'
import { fetchDeviceConfig, fetchSessionConfig } from './journeys/device-setup/deviceSetupAPI'
import { cacheAndFetch, primeImageCache, collectMenuImageUrls } from './core/utils/offlineCache'
import { pwaApiService } from './core/api/pwaApiService'
import { startSyncEngine } from './core/utils/syncEngine'
import { JOURNEYS } from './constants/journeys'
import DeviceSetupScreen from './journeys/device-setup/DeviceSetupScreen'
import DeviceReconfigScreen from './journeys/device-setup/DeviceReconfigScreen'
import MenuScreen from './journeys/menu/MenuScreen'
import StaticMenuScreen from './journeys/menu/StaticMenuScreen'
import WifiScreen from './journeys/wifi/WifiScreen'
import ReviewScreen from './journeys/review/ReviewScreen'
import LeadScreen from './journeys/lead/LeadScreen'
import WaiterCallScreen from './journeys/waiter/WaiterCallScreen'
import DashboardScreen from './journeys/dashboard/DashboardScreen'
import CartScreen from './journeys/cart/CartScreen'
import LoyaltyScreen from './journeys/loyalty/LoyaltyScreen'
import GamesScreen from './journeys/games/GamesScreen'
import StoreClosedScreen from './journeys/store-closed/StoreClosedScreen'
import BottomNav from './components/layout/BottomNav'
import FloatingWaiterCall from './components/layout/FloatingWaiterCall'
import OfflineBanner from './components/feedback/OfflineBanner'

/** Read journey key from URL pathname — e.g. /menu → 'menu' */
const readJourneyFromUrl = () => {
  const key = window.location.pathname.replace(/^\//, '').split('/')[0]
  return Object.values(JOURNEYS).includes(key) ? key : null
}

/** Push path while preserving all device query params */
const syncJourneyToUrl = (key) => {
  const path = key ? `/${key}` : `/${JOURNEYS.MENU}`
  window.history.pushState(null, '', `${path}${window.location.search}`)
}

/**
 * App root — device pairing gate + tabbed journey router.
 *
 * Layout (once configured):
 *   ┌─────────────────────┐
 *   │  Journey screen     │ flex-1
 *   ├─────────────────────┤
 *   │  BottomNav (5 tabs) │ shrink-0
 *   └─────────────────────┘
 *
 * Task 7.8: replace DEV MOCK with real GET /pwa/config fetch.
 */
export default function App() {
  const dispatch  = useDispatch()
  const { t }     = useTranslation('common')
  const pwaFeatures  = useSelector(selectPwaFeatures)
  const venueId      = useSelector(selectVenueId)

  // True once the REAL device config has loaded (carries venue_id) and the admin
  // has turned every PWA feature off. Gating on venue_id (not the mock-set
  // loaded flag) ensures the dev mock's all-on defaults don't mask this.
  const noFeaturesEnabled = !!venueId && pwaFeatures && !Object.values(pwaFeatures).some(Boolean)

  const [configured, setConfigured] = useState(() => isDeviceConfigured())
  // Becomes true once the device/config fetch has finished (success OR failure),
  // so we can hold a neutral loading screen until then — avoiding a flash of the
  // menu before we know which features the admin enabled.
  const [configReady, setConfigReady] = useState(false)
  const [journey,    setJourneyState] = useState(
    () => readJourneyFromUrl() ?? JOURNEYS.MENU,
  )
  const [reconfiguring, setReconfiguring] = useState(false)

  const setJourney = useCallback((key) => {
    syncJourneyToUrl(key)
    setJourneyState(key)
  }, [])

  // Redirect bare / to /menu on mount
  useEffect(() => {
    if (!readJourneyFromUrl()) syncJourneyToUrl(JOURNEYS.MENU)
  }, [])

  // Browser back/forward
  useEffect(() => {
    const onPop = () => {
      const key = readJourneyFromUrl() ?? JOURNEYS.MENU
      setJourneyState(key)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // ── DEV MOCK — remove when task 7.8 is done ──────────────────────────────
  useEffect(() => {
    if (import.meta.env.DEV) {
      const mockConfig = {
        scenario:   'C',
        features:   { menu: true, wifi: true, lead: true, review: true, waiter: true },
        journey_config: { wifi: true, review: true, loyalty: true, loyalty_benefits: '10% off your next visit + a free dessert on your birthday' },
        branding:   { venue_name: 'AYC Network', logo_url: null },
        timeouts:   null,
        return_url: null,
      }
      dispatch(setVenueConfig(mockConfig))
      configureTimeouts(mockConfig.timeouts ?? {})
    }
  }, [dispatch])
  // ─────────────────────────────────────────────────────────────────────────

  // ── Fresh device config + session init on every load ─────────────────────
  // Fetches venue_id, venue_name, tables[] from backend so any admin changes
  // to venue/table assignment are picked up on every WebView reload.
  //
  // Boot-time eager prefetch (offline-first): device/session config and the
  // menu are pulled into IndexedDB's reference_cache (offlineCache.js) here,
  // once, before the guest taps anything — not lazily per-screen. If offline
  // right now, cacheAndFetch() falls back to whatever was cached on some
  // earlier online load, so every journey works regardless of which guest
  // (if any) has actually opened it before on this device.
  useEffect(() => {
    if (!configured) return
    startSyncEngine()

    const run = async () => {
      try {
        // Fetch device config and venue session TTL in parallel
        const [deviceCfg, sessionTtlMs] = await Promise.all([
          cacheAndFetch('device_config', fetchDeviceConfig),
          cacheAndFetch('session_config', fetchSessionConfig),
        ])

        if (!deviceCfg) {
          // Never been online on this device — nothing cached, nothing fetched.
          // Non-fatal: journeys render with Redux defaults (see noFeaturesEnabled).
          return
        }

        dispatch(setVenueConfig({ ...deviceCfg, session_ttl_ms: sessionTtlMs }))
        applyVenueTheme(deviceCfg.theme)
        // session_idle_ms (live "close after" timer) is driven by the venue's
        // session_ttl_ms when the backend provides one — falls back to the
        // 30-min TIMEOUT_DEFAULTS value otherwise.
        configureTimeouts({
          ...deviceCfg.timeouts,
          ...(sessionTtlMs ? { session_idle_ms: sessionTtlMs } : {}),
        })

        // No table mapped to this device yet — flag it and force the menu tab so
        // the operator sees the warning and can double-tap the title to assign one.
        const tableMissing = !deviceCfg.tables || deviceCfg.tables.length === 0
        dispatch(setNoTableAssigned(tableMissing))

        // If the venue is outside its operating hours, redirect straight to store-closed
        if (deviceCfg.is_ordering_enabled === false) {
          setJourney(JOURNEYS.STORE_CLOSED)
        } else if (tableMissing) {
          setJourney(JOURNEYS.MENU)
        }

        // Use first table as default for session context (device serves multiple tables)
        const firstTable = deviceCfg.tables?.[0]
        const sessionId  = await initSession({
          table_name:   firstTable?.name ?? '',
          scenario:     getDeviceParams().scenario,
          sessionTtlMs: sessionTtlMs ?? undefined,
        })

        dispatch(setSession({
          sessionId,
          venueId:  deviceCfg.venue_id,
          screenId: getDeviceId(),
          table:    firstTable?.name ?? '',
          scenario: getDeviceParams().scenario,
        }))
      } catch {
        // Non-fatal — journeys still work without fresh config
      } finally {
        // Mark config resolved (even on failure) so the loading gate releases
        // and journeys render with whatever config we have.
        setConfigReady(true)
      }

      // Menu prefetch — separate from the gate above; MenuScreen/CartScreen
      // have their own loading states and read the same 'menu' cache key via
      // cacheAndFetch(), so a failure here is never fatal to the boot sequence.
      try {
        const menu = await cacheAndFetch('menu', async () => {
          const res = await pwaApiService.get('/pwa/menu')
          return res.data?.data ?? { categories: [] }
        })
        if (menu) primeImageCache(collectMenuImageUrls(menu))
      } catch {
        // Non-fatal — MenuScreen/CartScreen will retry their own fetch
      }
    }

    run()
  }, [configured, dispatch])
  // ─────────────────────────────────────────────────────────────────────────

  // Operator long-presses Menu → password → pick a new table for this device
  const handleTableChanged = (table) => {
    dispatch(setDeviceTables([{ id: table.id, name: table.name }]))
    dispatch(setSession({ table: table.name }))
    dispatch(setNoTableAssigned(false))
  }

  if (!configured) {
    return <DeviceSetupScreen onConfigured={() => setConfigured(isDeviceConfigured())} />
  }

  // Hold a neutral loading screen until the real device config resolves, so the
  // menu never flashes before we know whether the admin disabled everything.
  if (!configReady) {
    return (
      <div className="flex h-screen w-full max-w-[600px] mx-auto items-center justify-center bg-background">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  // Every PWA feature disabled by the admin → show a single centered message
  // instead of an empty screen with no navigation.
  if (noFeaturesEnabled) {
    return (
      <div className="flex h-screen w-full max-w-[600px] mx-auto items-center justify-center bg-background px-8 text-center">
        <p className="text-[14px] text-fg-muted">{t('no_features')}</p>
      </div>
    )
  }

  const renderScreen = () => {
    switch (journey) {
      case JOURNEYS.MENU:        return <MenuScreen onTitleDoubleClick={() => setReconfiguring(true)} onNavigate={setJourney} />
      case JOURNEYS.STATIC_MENU: return <StaticMenuScreen onNavigate={setJourney} />
      case JOURNEYS.WIFI:        return <WifiScreen onNavigate={setJourney} />
      case JOURNEYS.REVIEW:      return <ReviewScreen onNavigate={setJourney} />
      case JOURNEYS.LEAD:        return <LeadScreen />
      case JOURNEYS.WAITER:      return <WaiterCallScreen onNavigate={setJourney} />
      case JOURNEYS.DASHBOARD:   return <DashboardScreen />
      case JOURNEYS.CART:        return <CartScreen onNavigate={setJourney} />
      case JOURNEYS.LOYALTY:     return <LoyaltyScreen onNavigate={setJourney} />
      case JOURNEYS.GAME:        return <GamesScreen onNavigate={setJourney} />
      case JOURNEYS.STORE_CLOSED: return <StoreClosedScreen onNavigate={setJourney} />
      default:                   return <MenuScreen onNavigate={setJourney} />
    }
  }

  return (
    <div className="flex h-screen w-full max-w-[600px] mx-auto flex-col bg-background relative">
      <OfflineBanner />
      {/* Main content — no bottom padding when store is closed (no nav bar shown) */}
      <div className={`flex-1 overflow-y-auto flex flex-col ${journey === JOURNEYS.STORE_CLOSED ? '' : 'pb-28'}`}>
        {renderScreen()}
      </div>
      {journey !== JOURNEYS.DASHBOARD && journey !== JOURNEYS.STORE_CLOSED && (
        <BottomNav
          current={journey}
          onNavigate={setJourney}
        />
      )}
      {journey !== JOURNEYS.STORE_CLOSED && (
        <FloatingWaiterCall
          current={journey}
          onNavigate={setJourney}
        />
      )}
      {reconfiguring && (
        <DeviceReconfigScreen
          onClose={() => setReconfiguring(false)}
          onTableChanged={handleTableChanged}
        />
      )}
    </div>
  )
}
