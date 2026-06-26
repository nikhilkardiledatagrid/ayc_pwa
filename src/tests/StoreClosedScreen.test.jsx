/**
 * StoreClosedScreen unit tests — task 7.19
 *
 * Covers:
 *   - Renders heading and closed badge
 *   - Shows venue name from config
 *   - Shows alternate CTAs for enabled non-ordering features
 *   - Does NOT show menu CTA (ordering CTAs are excluded)
 *   - Tapping a CTA calls onNavigate with correct journey key
 *   - Tapping a CTA fires logEvent with CTA_TAPPED event type
 *   - Back button calls onBack when provided
 *   - Back button not rendered when onBack is not provided
 *   - Idle timeout calls returnToIdle
 *   - No alternate CTAs section when all features disabled
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import venueConfigReducer, { setVenueConfig } from '../core/store/venueConfigSlice'
import sessionReducer, { setSession } from '../core/store/sessionSlice'
import StoreClosedScreen from '../journeys/store-closed/StoreClosedScreen'
import { addTranslations } from '../i18n/index'
import enStoreClosed from '../i18n/locales/en/store-closed.json'

addTranslations('en', 'store-closed', enStoreClosed)

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../core/utils/eventQueue',    () => ({ logEvent:     vi.fn().mockResolvedValue(undefined) }))
vi.mock('../core/utils/returnToIdle',  () => ({ returnToIdle: vi.fn() }))

let capturedIdleCallback = null
vi.mock('../core/utils/timeoutManager', () => ({
  startTimeout: vi.fn((key, cb) => { capturedIdleCallback = cb }),
  stopTimeout:  vi.fn(),
}))

import { logEvent }     from '../core/utils/eventQueue'
import { returnToIdle } from '../core/utils/returnToIdle'

// ── Store factory ─────────────────────────────────────────────────────────────

const makeStore = (features = {}, overrides = {}) => {
  const store = configureStore({
    reducer: { venueConfig: venueConfigReducer, session: sessionReducer },
  })
  store.dispatch(setVenueConfig({
    loaded: true,
    features: { menu: false, wifi: true, review: true, lead: true, game: false, waiter: true, ...features },
    branding: { venue_name: 'La Mer Dubai', logo_url: null },
    return_url: '/idle',
    ...overrides,
  }))
  store.dispatch(setSession({ sessionId: 'test-session-001' }))
  return store
}

const renderScreen = (props = {}, store = makeStore()) =>
  render(
    <Provider store={store}>
      <StoreClosedScreen onNavigate={vi.fn()} {...props} />
    </Provider>,
  )

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  capturedIdleCallback = null
})

describe('StoreClosedScreen — heading & branding', () => {
  it('renders the closed heading', () => {
    renderScreen()
    expect(screen.getByText(enStoreClosed.heading)).toBeInTheDocument()
  })

  it('renders the subheading', () => {
    renderScreen()
    expect(screen.getByText(enStoreClosed.subheading)).toBeInTheDocument()
  })

  it('renders the Closed badge', () => {
    renderScreen()
    expect(screen.getByText(enStoreClosed.closed_badge)).toBeInTheDocument()
  })

  it('shows the alt CTA prompt when features are enabled', () => {
    renderScreen()
    expect(screen.getByText(enStoreClosed.alt_cta_prompt)).toBeInTheDocument()
  })
})

describe('StoreClosedScreen — alternate CTAs', () => {
  it('shows wifi CTA when wifi feature is enabled', () => {
    renderScreen()
    expect(screen.getByText(enStoreClosed.cta.wifi)).toBeInTheDocument()
  })

  it('shows review CTA when review feature is enabled', () => {
    renderScreen()
    expect(screen.getByText(enStoreClosed.cta.review)).toBeInTheDocument()
  })

  it('shows loyalty CTA when lead feature is enabled', () => {
    renderScreen()
    expect(screen.getByText(enStoreClosed.cta.lead)).toBeInTheDocument()
  })

  it('shows waiter CTA when waiter feature is enabled', () => {
    renderScreen()
    expect(screen.getByText(enStoreClosed.cta.waiter)).toBeInTheDocument()
  })

  it('does NOT show game CTA when game feature is disabled', () => {
    renderScreen({}, makeStore({ game: false }))
    expect(screen.queryByText(enStoreClosed.cta.game)).toBeNull()
  })

  it('shows game CTA when game feature is enabled', () => {
    renderScreen({}, makeStore({ game: true }))
    expect(screen.getByText(enStoreClosed.cta.game)).toBeInTheDocument()
  })

  it('hides alt CTA section entirely when no features are enabled', () => {
    const store = makeStore({ wifi: false, review: false, lead: false, game: false, waiter: false })
    renderScreen({}, store)
    expect(screen.queryByText(enStoreClosed.alt_cta_prompt)).toBeNull()
  })
})

describe('StoreClosedScreen — navigation', () => {
  it('calls onNavigate with "wifi" when WiFi CTA is tapped', async () => {
    const onNavigate = vi.fn()
    renderScreen({ onNavigate })
    fireEvent.click(screen.getByText(enStoreClosed.cta.wifi))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('wifi'))
  })

  it('calls onNavigate with "review" when Review CTA is tapped', async () => {
    const onNavigate = vi.fn()
    renderScreen({ onNavigate })
    fireEvent.click(screen.getByText(enStoreClosed.cta.review))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('review'))
  })

  it('fires CTA_TAPPED event when a CTA is tapped', async () => {
    const onNavigate = vi.fn()
    renderScreen({ onNavigate })
    fireEvent.click(screen.getByText(enStoreClosed.cta.wifi))
    await waitFor(() => {
      expect(logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'cta_tapped', cta_type: 'wifi' }),
      )
    })
  })
})

describe('StoreClosedScreen — back button', () => {
  it('renders back button when onBack is provided', () => {
    renderScreen({ onBack: vi.fn() })
    expect(screen.getByLabelText('Go back')).toBeInTheDocument()
  })

  it('does not render back button when onBack is not provided', () => {
    renderScreen()
    expect(screen.queryByLabelText('Go back')).toBeNull()
  })

  it('calls onBack when back button is tapped', () => {
    const onBack = vi.fn()
    renderScreen({ onBack })
    fireEvent.click(screen.getByLabelText('Go back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('StoreClosedScreen — idle timeout', () => {
  it('calls returnToIdle when the idle timeout fires', () => {
    renderScreen()
    expect(capturedIdleCallback).toBeTypeOf('function')
    capturedIdleCallback()
    expect(returnToIdle).toHaveBeenCalledWith({ return_url: '/idle' }, 'test-session-001')
  })
})
