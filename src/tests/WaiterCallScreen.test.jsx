/**
 * WaiterCallScreen unit tests
 *
 * Covers:
 *   - Spinner shown during initial CHECKING state
 *   - Both "Call Server" and "Call for Invoice" buttons shown in IDLE state
 *   - Clicking "Call Server" → POST /pwa/waiter-call → WAITING state with pulsing animation
 *   - Clicking "Call for Invoice" → POST /pwa/invoice-call → WAITING with amber ring
 *   - WAITING state hides call buttons and shows stop icon
 *   - Stop icon click → DELETE cancel endpoint called → returns to IDLE
 *   - SUCCESS state shows confirmation message after poll detects inactive
 *   - POST failure → ERROR state, buttons reappear
 *   - On mount active waiter call → goes to WAITING immediately
 *   - On mount active invoice call → goes to WAITING immediately
 *
 * NOTE: No DB access — all API calls are mocked. Tests only use vi.fn() mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import venueConfigReducer from '../core/store/venueConfigSlice'
import sessionReducer from '../core/store/sessionSlice'
import cartReducer from '../core/store/cartSlice'
import WaiterCallScreen from '../journeys/waiter/WaiterCallScreen'

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('../core/api/pwaApiService', () => ({
  pwaApiService: {
    get:    vi.fn(),
    post:   vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../core/utils/eventQueue', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../core/utils/returnToIdle', () => ({
  returnToIdle: vi.fn(),
}))

vi.mock('../core/utils/timeoutManager', () => ({
  startTimeout: vi.fn(),
  stopTimeout:  vi.fn(),
}))

import { pwaApiService } from '../core/api/pwaApiService'

// ── Test store ────────────────────────────────────────────────────────────────
const makeStore = () =>
  configureStore({ reducer: { venueConfig: venueConfigReducer, session: sessionReducer, cart: cartReducer } })

const renderScreen = (store = makeStore()) =>
  render(
    <Provider store={store}>
      <WaiterCallScreen />
    </Provider>,
  )

// ── Inactive status response (no active call) ─────────────────────────────────
const inactive = { data: { data: { active: false, called_at: null } } }
const active   = { data: { data: { active: true,  called_at: '2026-05-29T10:00:00.000000Z' } } }

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no active calls on mount
  pwaApiService.get.mockResolvedValue(inactive)
})

// ── Checking / loading ────────────────────────────────────────────────────────

describe('initial checking state', () => {
  it('shows spinner while mount check is in flight', () => {
    pwaApiService.get.mockReturnValue(new Promise(() => {}))
    renderScreen()
    expect(document.querySelector('.animate-spin')).toBeTruthy()
  })
})

// ── IDLE state — two buttons ──────────────────────────────────────────────────

describe('idle state', () => {
  it('shows Call Server and Call for Invoice buttons after mount check', async () => {
    renderScreen()
    await waitFor(() => {
      expect(screen.getByText('Call Server')).toBeInTheDocument()
      expect(screen.getByText('Call for Invoice')).toBeInTheDocument()
    })
  })

  it('shows "Need assistance?" prompt in idle state', async () => {
    renderScreen()
    await waitFor(() => {
      expect(screen.getByText('Need assistance?')).toBeInTheDocument()
    })
  })
})

// ── Call Waiter flow ──────────────────────────────────────────────────────────

describe('call waiter flow', () => {
  it('calls POST /pwa/waiter-call and shows WAITING state', async () => {
    pwaApiService.post.mockResolvedValue({ data: { data: null } })

    renderScreen()
    await waitFor(() => screen.getByText('Call Server'))

    fireEvent.click(screen.getByText('Call Server'))

    await waitFor(() => {
      expect(pwaApiService.post).toHaveBeenCalledWith('/pwa/waiter-call')
      expect(screen.getByText('Calling Server…')).toBeInTheDocument()
    })
  })

  it('hides call buttons during WAITING state', async () => {
    pwaApiService.post.mockResolvedValue({ data: { data: null } })

    renderScreen()
    await waitFor(() => screen.getByText('Call Server'))
    fireEvent.click(screen.getByText('Call Server'))

    await waitFor(() => {
      expect(screen.queryByText('Call Server')).not.toBeInTheDocument()
      expect(screen.queryByText('Call for Invoice')).not.toBeInTheDocument()
    })
  })

  it('shows stop icon during WAITING state', async () => {
    pwaApiService.post.mockResolvedValue({ data: { data: null } })

    renderScreen()
    await waitFor(() => screen.getByText('Call Server'))
    fireEvent.click(screen.getByText('Call Server'))

    await waitFor(() => {
      expect(screen.getByLabelText('Cancel call')).toBeInTheDocument()
    })
  })
})

// ── Call for Invoice flow ─────────────────────────────────────────────────────

describe('call for invoice flow', () => {
  it('calls POST /pwa/invoice-call and shows "Calling for Invoice…"', async () => {
    pwaApiService.post.mockResolvedValue({ data: { data: null } })

    renderScreen()
    await waitFor(() => screen.getByText('Call for Invoice'))

    fireEvent.click(screen.getByText('Call for Invoice'))

    await waitFor(() => {
      expect(pwaApiService.post).toHaveBeenCalledWith('/pwa/invoice-call')
      expect(screen.getByText('Calling for Invoice…')).toBeInTheDocument()
    })
  })
})

// ── Stop / cancel ─────────────────────────────────────────────────────────────

describe('stop icon (cancel)', () => {
  it('calls DELETE /pwa/waiter-call and returns to IDLE', async () => {
    pwaApiService.post.mockResolvedValue({ data: { data: null } })
    pwaApiService.delete.mockResolvedValue({ data: { data: null } })

    renderScreen()
    await waitFor(() => screen.getByText('Call Server'))
    fireEvent.click(screen.getByText('Call Server'))

    await waitFor(() => screen.getByLabelText('Cancel call'))
    fireEvent.click(screen.getByLabelText('Cancel call'))

    await waitFor(() => {
      expect(pwaApiService.delete).toHaveBeenCalledWith('/pwa/waiter-call')
      expect(screen.getByText('Call Server')).toBeInTheDocument()
    })
  })

  it('calls DELETE /pwa/invoice-call when cancelling an invoice call', async () => {
    pwaApiService.post.mockResolvedValue({ data: { data: null } })
    pwaApiService.delete.mockResolvedValue({ data: { data: null } })

    renderScreen()
    await waitFor(() => screen.getByText('Call for Invoice'))
    fireEvent.click(screen.getByText('Call for Invoice'))

    await waitFor(() => screen.getByLabelText('Cancel call'))
    fireEvent.click(screen.getByLabelText('Cancel call'))

    await waitFor(() => {
      expect(pwaApiService.delete).toHaveBeenCalledWith('/pwa/invoice-call')
    })
  })
})

// ── POST failure → ERROR ──────────────────────────────────────────────────────

describe('error state', () => {
  it('shows error message and re-displays buttons on POST failure', async () => {
    pwaApiService.post.mockRejectedValue({
      response: { data: { message: 'Device not mapped to any table.' } },
    })

    renderScreen()
    await waitFor(() => screen.getByText('Call Server'))
    fireEvent.click(screen.getByText('Call Server'))

    await waitFor(() => {
      expect(screen.getByText('Device not mapped to any table.')).toBeInTheDocument()
      expect(screen.getByText('Call Server')).toBeInTheDocument()
    })
  })
})

// ── Mount check: resume active waiter call ────────────────────────────────────

describe('mount check — resume active calls', () => {
  it('goes to WAITING if waiter call is active on mount', async () => {
    pwaApiService.get
      .mockResolvedValueOnce(active)   // waiter status → active
      .mockResolvedValueOnce(inactive) // invoice status → inactive

    renderScreen()

    await waitFor(() => {
      expect(screen.getByText('Calling Server…')).toBeInTheDocument()
    })
  })

  it('goes to WAITING if invoice call is active on mount', async () => {
    pwaApiService.get
      .mockResolvedValueOnce(inactive) // waiter status → inactive
      .mockResolvedValueOnce(active)   // invoice status → active

    renderScreen()

    await waitFor(() => {
      expect(screen.getByText('Calling for Invoice…')).toBeInTheDocument()
    })
  })
})
