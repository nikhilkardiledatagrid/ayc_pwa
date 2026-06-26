/**
 * WifiScreen unit tests
 *
 * Covers:
 *   - Loading state shown while fetching WiFi configs
 *   - No-wifi state when venue has no configs
 *   - Form rendered when configs exist
 *   - Validation: empty name → error shown, no API call
 *   - Validation: empty mobile → error shown, no API call
 *   - Successful submit → POST called → slider shown
 *   - Slider: QR code rendered for first network
 *   - Slider: back button returns to form
 *   - Slider: dot indicators shown for multiple networks
 *   - Network error on submit → error message shown
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import venueConfigReducer from '../core/store/venueConfigSlice'
import sessionReducer from '../core/store/sessionSlice'
import cartReducer from '../core/store/cartSlice'
import WifiScreen from '../journeys/wifi/WifiScreen'
import { addTranslations } from '../i18n/index'
import enWifi from '../i18n/locales/en/wifi.json'

// ── Register i18n ─────────────────────────────────────────────────────────────
addTranslations('en', 'wifi', enWifi)

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('../core/api/pwaApiService', () => ({
  pwaApiService: {
    get:  vi.fn(),
    post: vi.fn(),
  },
  safeFetch: vi.fn(),
}))

vi.mock('../core/utils/eventQueue', () => ({
  logEvent: vi.fn(),
}))

vi.mock('../core/utils/returnToIdle', () => ({
  returnToIdle: vi.fn(),
}))

vi.mock('../core/utils/timeoutManager', () => ({
  startTimeout: vi.fn(),
  stopTimeout:  vi.fn(),
}))

import { pwaApiService, safeFetch } from '../core/api/pwaApiService'

// ── Test store ────────────────────────────────────────────────────────────────
const makeStore = () =>
  configureStore({ reducer: { venueConfig: venueConfigReducer, session: sessionReducer, cart: cartReducer } })

const renderWifi = (store = makeStore()) =>
  render(
    <Provider store={store}>
      <WifiScreen />
    </Provider>,
  )

// ── Seed data ─────────────────────────────────────────────────────────────────
const ONE_NETWORK = [
  { id: 1, ssid: 'VenueGuest_5G', password: 'Pass@123', security_type: 'WPA', wifi_qr_enabled: true },
]

const TWO_NETWORKS = [
  { id: 1, ssid: 'VenueGuest_5G', password: 'Pass@123',  security_type: 'WPA',    wifi_qr_enabled: true },
  { id: 2, ssid: 'VenuePublic',   password: '',           security_type: 'nopass', wifi_qr_enabled: true },
]

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Loading state ─────────────────────────────────────────────────────────────

describe('loading state', () => {
  it('shows loading indicator while fetching', async () => {
    // safeFetch never resolves (pending)
    safeFetch.mockReturnValue(new Promise(() => {}))

    renderWifi()

    expect(screen.getByText(enWifi.loading)).toBeInTheDocument()
  })
})

// ── No-wifi state ─────────────────────────────────────────────────────────────

describe('no-wifi state', () => {
  it('shows no-wifi message when venue has empty configs', async () => {
    safeFetch.mockResolvedValue({ data: { data: [] } })

    renderWifi()

    await waitFor(() => {
      expect(screen.getByText(enWifi.no_wifi.title)).toBeInTheDocument()
    })
  })

  it('shows no-wifi when safeFetch returns null (network error)', async () => {
    safeFetch.mockResolvedValue(null)

    renderWifi()

    await waitFor(() => {
      expect(screen.getByText(enWifi.no_wifi.title)).toBeInTheDocument()
    })
  })

  it('does not hang on the loading spinner when safeFetch rejects (stale navigator.onLine)', async () => {
    // Regression: navigator.onLine can be stale (e.g. Chrome reporting "online"
    // while every real request fails), in which case safeFetch re-throws
    // instead of returning its null fallback. Before the fix, WifiScreen had
    // no catch around this call, so the rejection was unhandled and the
    // screen stayed on the loading spinner forever.
    safeFetch.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))

    renderWifi()

    await waitFor(() => {
      expect(screen.getByText(enWifi.fetch_error.title)).toBeInTheDocument()
    })
  })
})

// ── Guest info form ───────────────────────────────────────────────────────────

describe('guest info form', () => {
  beforeEach(() => {
    safeFetch.mockResolvedValue({ data: { data: ONE_NETWORK } })
  })

  it('renders form heading and fields after load', async () => {
    renderWifi()

    await waitFor(() => {
      expect(screen.getByText(enWifi.form.heading)).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText(enWifi.form.name_placeholder)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(enWifi.form.mobile_placeholder)).toBeInTheDocument()
    expect(screen.getByText(enWifi.form.submit)).toBeInTheDocument()
  })

  it('shows name error and does not POST when name is empty', async () => {
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), {
      target: { value: '971501234567' },
    })
    fireEvent.click(screen.getByText(enWifi.form.submit))

    expect(screen.getByText(enWifi.form.error_name_required)).toBeInTheDocument()
    expect(pwaApiService.post).not.toHaveBeenCalled()
  })

  it('shows mobile error and does not POST when mobile is empty', async () => {
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), {
      target: { value: 'Ahmed' },
    })
    fireEvent.click(screen.getByText(enWifi.form.submit))

    expect(screen.getByText(enWifi.form.error_mobile_required)).toBeInTheDocument()
    expect(pwaApiService.post).not.toHaveBeenCalled()
  })

  it('POSTs to /pwa/wifi/log with correct payload on valid submit', async () => {
    pwaApiService.post.mockResolvedValue({ data: { success: true } })

    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), {
      target: { value: 'Sara Al Rashid' },
    })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), {
      target: { value: '971501234567' },
    })

    await act(async () => {
      fireEvent.click(screen.getByText(enWifi.form.submit))
    })

    expect(pwaApiService.post).toHaveBeenCalledWith('/pwa/wifi/log', {
      full_name: 'Sara Al Rashid',
      mobile:    '+971971501234567',
      ssid:      'VenueGuest_5G',
    })
  })

  it('shows slider after successful submit', async () => {
    pwaApiService.post.mockResolvedValue({ data: { success: true } })

    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '971509876543' } })

    await act(async () => {
      fireEvent.click(screen.getByText(enWifi.form.submit))
    })

    await waitFor(() => {
      expect(screen.getByText(enWifi.slider.heading)).toBeInTheDocument()
    })
  })

  // ── Mobile number format validation ──────────────────────────────────────────

  it('accepts valid UAE international format +971 50 123 4567', async () => {
    pwaApiService.post.mockResolvedValue({ data: { success: true } })
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '+971 50 123 4567' } })

    await act(async () => { fireEvent.click(screen.getByText(enWifi.form.submit)) })

    expect(screen.queryByText(enWifi.form.error_mobile_invalid)).not.toBeInTheDocument()
    expect(pwaApiService.post).toHaveBeenCalled()
  })

  it('accepts valid local UAE format 0501234567', async () => {
    pwaApiService.post.mockResolvedValue({ data: { success: true } })
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Sara' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '0501234567' } })

    await act(async () => { fireEvent.click(screen.getByText(enWifi.form.submit)) })

    expect(screen.queryByText(enWifi.form.error_mobile_invalid)).not.toBeInTheDocument()
    expect(pwaApiService.post).toHaveBeenCalled()
  })

  it('accepts valid digits-only format 971501234567', async () => {
    pwaApiService.post.mockResolvedValue({ data: { success: true } })
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Sara' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '971501234567' } })

    await act(async () => { fireEvent.click(screen.getByText(enWifi.form.submit)) })

    expect(screen.queryByText(enWifi.form.error_mobile_invalid)).not.toBeInTheDocument()
    expect(pwaApiService.post).toHaveBeenCalled()
  })

  it('rejects mobile with letters and does not POST', async () => {
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: 'abc123xyz' } })

    fireEvent.click(screen.getByText(enWifi.form.submit))

    expect(screen.getByText(enWifi.form.error_mobile_invalid)).toBeInTheDocument()
    expect(pwaApiService.post).not.toHaveBeenCalled()
  })

  it('rejects mobile that is too short (under 7 digits) and does not POST', async () => {
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '123' } })

    fireEvent.click(screen.getByText(enWifi.form.submit))

    expect(screen.getByText(enWifi.form.error_mobile_invalid)).toBeInTheDocument()
    expect(pwaApiService.post).not.toHaveBeenCalled()
  })

  it('rejects mobile with special characters only and does not POST', async () => {
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '!!!###' } })

    fireEvent.click(screen.getByText(enWifi.form.submit))

    expect(screen.getByText(enWifi.form.error_mobile_invalid)).toBeInTheDocument()
    expect(pwaApiService.post).not.toHaveBeenCalled()
  })

  it('rejects partial country code +971 alone (too short) and does not POST', async () => {
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '+971' } })

    fireEvent.click(screen.getByText(enWifi.form.submit))

    expect(screen.getByText(enWifi.form.error_mobile_invalid)).toBeInTheDocument()
    expect(pwaApiService.post).not.toHaveBeenCalled()
  })

  it('rejects mobile that exceeds 15 digits and does not POST', async () => {
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '1234567890123456' } })

    fireEvent.click(screen.getByText(enWifi.form.submit))

    expect(screen.getByText(enWifi.form.error_mobile_invalid)).toBeInTheDocument()
    expect(pwaApiService.post).not.toHaveBeenCalled()
  })

  it('shows mobile required error (not format error) when field is completely empty', async () => {
    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.click(screen.getByText(enWifi.form.submit))

    expect(screen.getByText(enWifi.form.error_mobile_required)).toBeInTheDocument()
    expect(screen.queryByText(enWifi.form.error_mobile_invalid)).not.toBeInTheDocument()
    expect(pwaApiService.post).not.toHaveBeenCalled()
  })

  it('shows server error message when POST fails', async () => {
    pwaApiService.post.mockRejectedValue({
      response: { data: { message: 'Server error occurred.' } },
    })

    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '971501234567' } })

    await act(async () => {
      fireEvent.click(screen.getByText(enWifi.form.submit))
    })

    await waitFor(() => {
      expect(screen.getByText('Server error occurred.')).toBeInTheDocument()
    })
  })
})

// ── Slider ────────────────────────────────────────────────────────────────────

describe('wifi slider', () => {
  const goToSlider = async () => {
    safeFetch.mockResolvedValue({ data: { data: TWO_NETWORKS } })
    pwaApiService.post.mockResolvedValue({ data: { success: true } })

    renderWifi()
    await waitFor(() => screen.getByText(enWifi.form.submit))

    fireEvent.change(screen.getByPlaceholderText(enWifi.form.name_placeholder), { target: { value: 'Ahmed' } })
    fireEvent.change(screen.getByPlaceholderText(enWifi.form.mobile_placeholder), { target: { value: '971501234567' } })

    await act(async () => {
      fireEvent.click(screen.getByText(enWifi.form.submit))
    })

    await waitFor(() => screen.getByText(enWifi.slider.heading))
  }

  it('shows slider heading and first SSID after form submit', async () => {
    await goToSlider()

    expect(screen.getByText(enWifi.slider.heading)).toBeInTheDocument()
    expect(screen.getByText('VenueGuest_5G')).toBeInTheDocument()
  })

  it('shows dot indicators for multiple networks', async () => {
    await goToSlider()
    // counter text "1 of 2"
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
  })

  it('back button returns to form', async () => {
    await goToSlider()

    // Back is an icon-only button — first button inside the header
    const backBtn = document.querySelector('header button')
    expect(backBtn).toBeTruthy()
    fireEvent.click(backBtn)

    await waitFor(() => {
      expect(screen.getByText(enWifi.form.heading)).toBeInTheDocument()
    })
  })

  it('renders a QR svg element', async () => {
    await goToSlider()
    // qrcode.react renders an svg
    expect(document.querySelector('svg')).toBeTruthy()
  })
})
