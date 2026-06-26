/**
 * ReviewScreen unit tests (task 9.10)
 *
 * Covers:
 *   - Stars rendered in initial RATING state
 *   - High star (≥4) → POST /pwa/capture/review-intent → QR_DISPLAY
 *   - QR rendered with backend redirect_url
 *   - Low star (≤3) → FEEDBACK state (full_name input + reason textarea)
 *   - Low rating submit → POST /pwa/review-feedback with rating + full_name + reason
 *   - Low rating → THANK_YOU "Feedback sent successfully!"
 *   - No QR shown for low rating
 *   - Skip link → submits without reason text
 *   - REVIEW_TAPPED event logged on every star tap
 *   - POST failure → ERROR state, stars re-shown
 *   - Generic error message when no API message returned
 *
 * NOTE: No DB access — all API calls are mocked. No vi.useFakeTimers().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import venueConfigReducer from '../core/store/venueConfigSlice'
import sessionReducer from '../core/store/sessionSlice'
import cartReducer from '../core/store/cartSlice'
import ReviewScreen from '../journeys/review/ReviewScreen'

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('../core/api/pwaApiService', () => ({
  pwaApiService: {
    post: vi.fn(),
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

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }) => <div data-testid="qr-code" data-value={value} />,
}))

import { pwaApiService } from '../core/api/pwaApiService'
import { logEvent }      from '../core/utils/eventQueue'

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeStore = () =>
  configureStore({
    reducer: {
      venueConfig: venueConfigReducer,
      session:     sessionReducer,
      cart:        cartReducer,
    },
    preloadedState: {
      session: { sessionId: 'test-session-id', screenId: 5 },
    },
  })

const renderScreen = (store = makeStore()) =>
  render(
    <Provider store={store}>
      <ReviewScreen />
    </Provider>,
  )

const highRatingResponse = {
  data: {
    data: { redirect_url: 'http://localhost:8000/api/v1/public/review/redirect/MQ' },
  },
}

const lowRatingResponse = { data: { data: null } }

beforeEach(() => {
  vi.clearAllMocks()
})

// ── RATING state ──────────────────────────────────────────────────────────────

describe('initial rating state', () => {
  it('renders 5 star buttons', () => {
    renderScreen()
    expect(screen.getAllByRole('button', { name: /star/i })).toHaveLength(5)
  })

  it('shows "How was your experience?" heading', () => {
    renderScreen()
    expect(screen.getByText('How was your experience?')).toBeInTheDocument()
  })

  it('shows "Tap a star to rate us" prompt', () => {
    renderScreen()
    expect(screen.getByText('Tap a star to rate us')).toBeInTheDocument()
  })
})

// ── High rating (≥4) → POST /pwa/capture/review-intent ───────────────────────

describe('high rating flow (≥4 stars)', () => {
  it('POSTs to /pwa/capture/review-intent on 5-star tap', async () => {
    pwaApiService.post.mockResolvedValue(highRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('5 stars'))

    await waitFor(() => {
      expect(pwaApiService.post).toHaveBeenCalledWith(
        '/pwa/capture/review-intent',
        expect.objectContaining({ rating: 5, session_id: 'test-session-id', screen_id: 5 }),
      )
    })
  })

  it('shows QR code after 5-star submission', async () => {
    pwaApiService.post.mockResolvedValue(highRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('5 stars'))

    await waitFor(() => {
      expect(screen.getByTestId('qr-code')).toBeInTheDocument()
    })
  })

  it('QR value is the redirect_url returned by backend', async () => {
    pwaApiService.post.mockResolvedValue(highRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('4 stars'))

    await waitFor(() => {
      expect(screen.getByTestId('qr-code').dataset.value).toContain('/review/redirect/')
    })
  })

  it('shows "Scan with your phone" instruction', async () => {
    pwaApiService.post.mockResolvedValue(highRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('5 stars'))

    await waitFor(() => {
      expect(screen.getByText(/Scan with your phone/i)).toBeInTheDocument()
    })
  })

  it('does NOT call /pwa/review-feedback for high rating', async () => {
    pwaApiService.post.mockResolvedValue(highRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('5 stars'))

    await waitFor(() => pwaApiService.post.mock.calls.length > 0)
    expect(pwaApiService.post.mock.calls[0][0]).toBe('/pwa/capture/review-intent')
  })
})

// ── Low rating (≤3) → POST /pwa/review-feedback ──────────────────────────────

describe('low rating flow (≤3 stars)', () => {
  it('shows full name input and reason textarea after 2-star tap', async () => {
    renderScreen()
    fireEvent.click(screen.getByLabelText('2 stars'))

    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toBeInTheDocument()
      expect(screen.getByLabelText('Feedback')).toBeInTheDocument()
    })
  })

  it('POSTs to /pwa/review-feedback with rating + full_name + reason', async () => {
    pwaApiService.post.mockResolvedValue(lowRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('2 stars'))

    await waitFor(() => screen.getByLabelText('Full name'))
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText('Feedback'), { target: { value: 'Service slow.' } })
    fireEvent.click(screen.getByLabelText('Submit review'))

    await waitFor(() => {
      expect(pwaApiService.post).toHaveBeenCalledWith(
        '/pwa/review-feedback',
        expect.objectContaining({ rating: 2, full_name: 'Jane Doe', reason: 'Service slow.' }),
      )
    })
  })

  it('does NOT call /pwa/capture/review-intent for low rating', async () => {
    pwaApiService.post.mockResolvedValue(lowRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('3 stars'))

    await waitFor(() => screen.getByLabelText('Submit review'))
    fireEvent.click(screen.getByLabelText('Submit review'))

    await waitFor(() => pwaApiService.post.mock.calls.length > 0)
    expect(pwaApiService.post.mock.calls[0][0]).toBe('/pwa/review-feedback')
  })

  it('Skip resets to star rating screen without submitting', async () => {
    renderScreen()
    fireEvent.click(screen.getByLabelText('1 star'))

    await waitFor(() => screen.getByLabelText('Skip feedback'))
    fireEvent.click(screen.getByLabelText('Skip feedback'))

    await waitFor(() => {
      expect(screen.getByText('How was your experience?')).toBeInTheDocument()
      expect(screen.getByText('Tap a star to rate us')).toBeInTheDocument()
    })
    expect(pwaApiService.post).not.toHaveBeenCalledWith('/pwa/review-feedback', expect.anything())
  })

  it('shows "Feedback sent successfully!" after low-rating submission', async () => {
    pwaApiService.post.mockResolvedValue(lowRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('3 stars'))

    await waitFor(() => screen.getByLabelText('Submit review'))
    fireEvent.click(screen.getByLabelText('Submit review'))

    await waitFor(() => {
      expect(screen.getByText('Feedback sent successfully!')).toBeInTheDocument()
    })
  })

  it('does NOT show QR code for low rating', async () => {
    pwaApiService.post.mockResolvedValue(lowRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('2 stars'))

    await waitFor(() => screen.getByLabelText('Submit review'))
    fireEvent.click(screen.getByLabelText('Submit review'))

    await waitFor(() => {
      expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument()
    })
  })
})

// ── Event logging ─────────────────────────────────────────────────────────────

describe('event logging', () => {
  it('logs REVIEW_TAPPED when a star is tapped', async () => {
    pwaApiService.post.mockResolvedValue(highRatingResponse)
    renderScreen()
    fireEvent.click(screen.getByLabelText('5 stars'))

    await waitFor(() => {
      expect(logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'review_tapped',
          rating: 5,
        }),
      )
    })
  })
})

// ── Error state ───────────────────────────────────────────────────────────────

describe('error state', () => {
  it('shows error message and re-displays stars on POST failure', async () => {
    pwaApiService.post.mockRejectedValue({
      response: { data: { message: 'Device not deployed to any venue.' } },
    })

    renderScreen()
    fireEvent.click(screen.getByLabelText('5 stars'))

    await waitFor(() => {
      expect(screen.getByText('Device not deployed to any venue.')).toBeInTheDocument()
      expect(screen.getByLabelText('1 star')).toBeInTheDocument()
    })
  })

  it('shows generic error when no API message returned', async () => {
    pwaApiService.post.mockRejectedValue(new Error('Network error'))
    renderScreen()
    fireEvent.click(screen.getByLabelText('4 stars'))

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    })
  })
})
