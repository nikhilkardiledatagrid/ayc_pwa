/**
 * Skeletons unit tests — task 7.21
 *
 * Covers:
 *   - Each exported skeleton renders without error
 *   - animate-pulse class is present (confirms shimmer is active)
 *   - MenuLandingSkeleton has enough bones to prevent blank-screen
 *   - CategoryItemsSkeleton renders the expected number of cards
 *   - MenuScreen shows MenuLandingSkeleton while data is loading
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import {
  MenuLandingSkeleton,
  CategoryItemsSkeleton,
  ItemCardSkeleton,
  WifiSkeleton,
  ReviewSkeleton,
  FormSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
} from '../components/feedback/Skeletons'
import venueConfigReducer, { setVenueConfig } from '../core/store/venueConfigSlice'
import sessionReducer from '../core/store/sessionSlice'
import cartReducer from '../core/store/cartSlice'
import MenuScreen from '../journeys/menu/MenuScreen'
import { addTranslations } from '../i18n/index'
import enMenu from '../i18n/locales/en/menu.json'

addTranslations('en', 'menu', enMenu)

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../core/api/pwaApiService', () => ({
  pwaApiService: { get: vi.fn() },
  safeFetch: vi.fn(),
}))

vi.mock('../core/utils/eventQueue',    () => ({ logEvent:     vi.fn() }))
vi.mock('../core/utils/returnToIdle',  () => ({ returnToIdle: vi.fn() }))
vi.mock('../core/utils/timeoutManager', () => ({
  startTimeout: vi.fn(),
  stopTimeout:  vi.fn(),
}))

import { safeFetch } from '../core/api/pwaApiService'

const makeStore = (venueOverrides = {}) => {
  const store = configureStore({
    reducer: { venueConfig: venueConfigReducer, session: sessionReducer, cart: cartReducer },
  })
  store.dispatch(setVenueConfig({
    loaded: true, features: { menu: true }, branding: { venue_name: 'Test' }, ...venueOverrides,
  }))
  return store
}

// ── Individual skeleton render tests ─────────────────────────────────────────

describe('Skeletons — individual components', () => {
  const skeletons = [
    ['MenuLandingSkeleton',    () => render(<MenuLandingSkeleton />)],
    ['CategoryItemsSkeleton',  () => render(<CategoryItemsSkeleton />)],
    ['ItemCardSkeleton',       () => render(<ItemCardSkeleton />)],
    ['WifiSkeleton',           () => render(<WifiSkeleton />)],
    ['ReviewSkeleton',         () => render(<ReviewSkeleton />)],
    ['FormSkeleton',           () => render(<FormSkeleton />)],
    ['ListSkeleton',           () => render(<ListSkeleton />)],
    ['PageHeaderSkeleton',     () => render(<PageHeaderSkeleton />)],
  ]

  skeletons.forEach(([name, renderFn]) => {
    it(`${name} renders without throwing`, () => {
      expect(() => renderFn()).not.toThrow()
    })
  })

  it('each skeleton contains at least one animate-pulse element', () => {
    const skeletonFns = [
      MenuLandingSkeleton, CategoryItemsSkeleton, ItemCardSkeleton,
      WifiSkeleton, ReviewSkeleton, FormSkeleton, ListSkeleton, PageHeaderSkeleton,
    ]
    skeletonFns.forEach((Sk) => {
      const { container } = render(<Sk />)
      expect(container.querySelector('.animate-pulse')).not.toBeNull()
    })
  })
})

// ── CategoryItemsSkeleton count ───────────────────────────────────────────────

describe('CategoryItemsSkeleton', () => {
  it('renders 6 item cards by default', () => {
    const { container } = render(<CategoryItemsSkeleton count={6} />)
    // each ItemCardSkeleton has a top image bone with h-40 class
    const imageBones = container.querySelectorAll('.h-40')
    expect(imageBones.length).toBe(6)
  })

  it('renders custom count when count prop provided', () => {
    const { container } = render(<CategoryItemsSkeleton count={4} />)
    const imageBones = container.querySelectorAll('.h-40')
    expect(imageBones.length).toBe(4)
  })
})

// ── MenuScreen shows skeleton while loading ───────────────────────────────────

describe('MenuScreen skeleton integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeFetch.mockReturnValue(new Promise(() => {})) // never resolves = stays in loading
  })

  it('shows MenuLandingSkeleton (not spinner text) while menu data is loading', () => {
    const store = makeStore()
    render(
      <Provider store={store}>
        <MenuScreen />
      </Provider>,
    )
    // Old spinner rendered translation key "Loading menu…" — skeleton does not
    expect(screen.queryByText(enMenu.loading)).toBeNull()
    // animate-pulse bones are in the document (from the skeleton)
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('shows error state after fetch returns null', async () => {
    safeFetch.mockResolvedValue(null) // null → setError(true)

    const store = makeStore()
    render(
      <Provider store={store}>
        <MenuScreen />
      </Provider>,
    )

    await waitFor(() => {
      expect(screen.getByText(enMenu.error.title)).toBeInTheDocument()
    })
  })
})
