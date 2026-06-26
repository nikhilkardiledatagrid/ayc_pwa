import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import HomeScreen from './HomeScreen'
import sessionReducer from '../../core/store/sessionSlice'
import venueConfigReducer from '../../core/store/venueConfigSlice'
import cartReducer from '../../core/store/cartSlice'
import { addTranslations } from '../../i18n/index'
import enCommon from '../../i18n/locales/en/common.json'
import enHome from '../../i18n/locales/en/home.json'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../core/utils/sessionManager', () => ({
  createSession:  vi.fn().mockResolvedValue('mock-session-id'),
  upgradeSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../core/utils/eventQueue', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../core/utils/timeoutManager', () => ({
  startTimeout: vi.fn(),
  stopTimeout:  vi.fn(),
}))

vi.mock('../../core/utils/returnToIdle', () => ({
  returnToIdle: vi.fn(),
}))

vi.mock('../../core/utils/urlParams', () => ({
  getDeviceParams: vi.fn(() => ({
    venue_id: '1', screen_id: '2', table: '7', scenario: 'C',
  })),
}))

import { createSession, upgradeSession } from '../../core/utils/sessionManager'
import { logEvent }                       from '../../core/utils/eventQueue'
import { startTimeout, stopTimeout }      from '../../core/utils/timeoutManager'
import { returnToIdle }                   from '../../core/utils/returnToIdle'

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeStore = (preloadedState = {}) =>
  configureStore({
    reducer: { session: sessionReducer, venueConfig: venueConfigReducer, cart: cartReducer },
    preloadedState,
  })

const renderScreen = (onNavigate = vi.fn(), store = makeStore()) => {
  render(
    <Provider store={store}>
      <HomeScreen onNavigate={onNavigate} />
    </Provider>
  )
  return { store, onNavigate }
}

// Config with all features on
const ALL_FEATURES = {
  venueConfig: {
    loaded: true, scenario: 'C', return_url: 'https://idle.test',
    features: { menu: true, wifi: true, lead: true, review: true, game: true },
    branding: { venue_name: 'Test Venue', logo_url: null },
    timeouts: null,
  },
}

// Config with subset of features
const MENU_WIFI_ONLY = {
  venueConfig: {
    loaded: true, scenario: 'A', return_url: null,
    features: { menu: true, wifi: true, lead: false, review: false, game: false },
    branding: null, timeouts: null,
  },
}

// Config loaded but nothing enabled
const NO_FEATURES = {
  venueConfig: {
    loaded: true, scenario: 'C', return_url: null,
    features: { menu: false, wifi: false, lead: false, review: false, game: false },
    branding: null, timeouts: null,
  },
}

// Register real translations once — tests use actual lang file values
beforeAll(() => {
  addTranslations('en', 'common', enCommon)
  addTranslations('en', 'home',   enHome)
})

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HomeScreen — loading state', () => {
  it('shows connecting screen when venueConfig is not loaded', () => {
    renderScreen()
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
  })

  it('does not show CTA buttons while loading', () => {
    renderScreen()
    expect(screen.queryByText('View Menu')).not.toBeInTheDocument()
  })
})

describe('HomeScreen — CTA rendering', () => {
  it('renders all enabled CTA buttons', () => {
    renderScreen(vi.fn(), makeStore(ALL_FEATURES))
    expect(screen.getByText('Menu')).toBeInTheDocument()
    expect(screen.getByText('Wi-Fi')).toBeInTheDocument()
    expect(screen.getByText('Leads')).toBeInTheDocument()   // cta.lead = "Leads"
    expect(screen.getByText('Rate Us')).toBeInTheDocument()
    // game journey has no CTA definition in HomeScreen — not rendered
  })

  it('renders only the enabled feature CTAs', () => {
    renderScreen(vi.fn(), makeStore(MENU_WIFI_ONLY))
    expect(screen.getByText('Menu')).toBeInTheDocument()
    expect(screen.getByText('Wi-Fi')).toBeInTheDocument()
    expect(screen.queryByText('Leads')).not.toBeInTheDocument()
    expect(screen.queryByText('Rate Us')).not.toBeInTheDocument()
  })

  it('shows no-features screen when all features are disabled', () => {
    renderScreen(vi.fn(), makeStore(NO_FEATURES))
    expect(screen.getByText('No features configured for this screen.')).toBeInTheDocument()
    expect(screen.queryByText('View Menu')).not.toBeInTheDocument()
  })
})

describe('HomeScreen — branding', () => {
  it('shows venue name in welcome heading', () => {
    renderScreen(vi.fn(), makeStore(ALL_FEATURES))
    expect(screen.getByText('Welcome to Test Venue')).toBeInTheDocument()
  })

  it('shows generic welcome when no venue name', () => {
    renderScreen(vi.fn(), makeStore(MENU_WIFI_ONLY))
    expect(screen.getByText('Welcome')).toBeInTheDocument()
  })

  it('shows table number from URL params', () => {
    renderScreen(vi.fn(), makeStore(ALL_FEATURES))
    expect(screen.getByText('Table 7')).toBeInTheDocument()
  })
})

describe('HomeScreen — idle timeout', () => {
  it('arms session_idle_ms timeout on mount', () => {
    renderScreen(vi.fn(), makeStore(ALL_FEATURES))
    expect(startTimeout).toHaveBeenCalledWith('session_idle_ms', expect.any(Function))
  })

  it('clears timeout on unmount', () => {
    const { unmount } = render(
      <Provider store={makeStore(ALL_FEATURES)}>
        <HomeScreen onNavigate={vi.fn()} />
      </Provider>
    )
    unmount()
    expect(stopTimeout).toHaveBeenCalledWith('session_idle_ms')
  })

  it('idle timeout callback calls returnToIdle with return_url', () => {
    renderScreen(vi.fn(), makeStore(ALL_FEATURES))
    const [[, callback]] = startTimeout.mock.calls
    callback()
    expect(returnToIdle).toHaveBeenCalledWith({ return_url: 'https://idle.test' }, null)
  })
})

describe('HomeScreen — first CTA tap creates session', () => {
  it('calls createSession with device params on first tap', async () => {
    const onNavigate = vi.fn()
    renderScreen(onNavigate, makeStore(ALL_FEATURES))

    fireEvent.click(screen.getByText('Menu'))

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith({
        venue_id: '1', screen_id: '2', table: '7', scenario: 'C',
      })
    })
  })

  it('calls upgradeSession with the new session id', async () => {
    renderScreen(vi.fn(), makeStore(ALL_FEATURES))
    fireEvent.click(screen.getByText('Menu'))
    await waitFor(() => {
      expect(upgradeSession).toHaveBeenCalledWith('mock-session-id')
    })
  })

  it('logs cta_tapped event with correct data', async () => {
    renderScreen(vi.fn(), makeStore(ALL_FEATURES))
    fireEvent.click(screen.getByText('Wi-Fi'))
    await waitFor(() => {
      expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'cta_tapped',
        cta_type:   'wifi',
        session_id: 'mock-session-id',
      }))
    })
  })

  it('calls onNavigate with the correct CTA key', async () => {
    const onNavigate = vi.fn()
    renderScreen(onNavigate, makeStore(ALL_FEATURES))
    fireEvent.click(screen.getByText('Leads'))  // cta.lead = "Leads"
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith('lead')
    })
  })
})

describe('HomeScreen — subsequent tap reuses existing session', () => {
  it('does NOT call createSession if session already exists in Redux', async () => {
    const storeWithSession = makeStore({
      ...ALL_FEATURES,
      session: {
        sessionId: 'existing-session', venueId: '1', screenId: '2',
        table: '7', scenario: 'C', sessionType: 'engaged',
      },
    })
    renderScreen(vi.fn(), storeWithSession)
    fireEvent.click(screen.getByText('Menu'))
    await waitFor(() => {
      expect(logEvent).toHaveBeenCalled()
    })
    expect(createSession).not.toHaveBeenCalled()
  })

  it('logs cta_tapped with existing session id', async () => {
    const storeWithSession = makeStore({
      ...ALL_FEATURES,
      session: {
        sessionId: 'existing-session', venueId: '1', screenId: '2',
        table: '7', scenario: 'C', sessionType: 'engaged',
      },
    })
    renderScreen(vi.fn(), storeWithSession)
    fireEvent.click(screen.getByText('Rate Us'))
    await waitFor(() => {
      expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
        cta_type:   'review',
        session_id: 'existing-session',
      }))
    })
  })
})

describe('HomeScreen — session API failure fallback', () => {
  it('still navigates when createSession rejects', async () => {
    createSession.mockRejectedValueOnce(new Error('API down'))
    const onNavigate = vi.fn()
    renderScreen(onNavigate, makeStore(ALL_FEATURES))
    fireEvent.click(screen.getByText('Menu'))
    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith('menu')
    })
  })
})
