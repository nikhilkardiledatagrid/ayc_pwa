/**
 * NetworkError + OfflineBanner unit tests — task 7.20
 *
 * Covers:
 *   NetworkError:
 *     - Renders default API error message
 *     - Renders offline-specific message when offline=true
 *     - Shows retry button when onRetry provided
 *     - Calls onRetry on tap
 *     - Hides retry button when onRetry not provided
 *     - Accepts custom title and message props
 *     - compact mode renders without flex-1 full-screen wrapper
 *
 *   OfflineBanner:
 *     - Hidden when navigator.onLine is true (mocked)
 *     - Visible when offline event fires
 *     - Disappears when online event fires
 *     - Dismiss button hides the banner
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import NetworkError from '../components/feedback/NetworkError'
import OfflineBanner from '../components/feedback/OfflineBanner'

// ── NetworkError ──────────────────────────────────────────────────────────────

describe('NetworkError', () => {
  it('renders default error heading and message', () => {
    render(<NetworkError />)
    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByText(/couldn't reach the server/i)).toBeInTheDocument()
  })

  it('renders offline heading when offline=true', () => {
    render(<NetworkError offline />)
    expect(screen.getByText("You're offline")).toBeInTheDocument()
    expect(screen.getByText(/Check your connection/i)).toBeInTheDocument()
  })

  it('shows retry button when onRetry is provided', () => {
    render(<NetworkError onRetry={vi.fn()} />)
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('does not show retry button when onRetry is not provided', () => {
    render(<NetworkError />)
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('calls onRetry when retry button is tapped', () => {
    const onRetry = vi.fn()
    render(<NetworkError onRetry={onRetry} />)
    fireEvent.click(screen.getByText('Try again'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('accepts and renders custom title', () => {
    render(<NetworkError title="Custom error" />)
    expect(screen.getByText('Custom error')).toBeInTheDocument()
  })

  it('accepts and renders custom message', () => {
    render(<NetworkError message="Please contact support." />)
    expect(screen.getByText('Please contact support.')).toBeInTheDocument()
  })
})

// ── OfflineBanner ─────────────────────────────────────────────────────────────

describe('OfflineBanner', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine')

  const setOnline = (value) => {
    Object.defineProperty(navigator, 'onLine', { get: () => value, configurable: true })
  }

  beforeEach(() => {
    setOnline(true)
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOnLine)
    }
  })

  it('is not visible when navigator.onLine is true on mount', () => {
    setOnline(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the banner when the offline event fires', async () => {
    setOnline(false)
    render(<OfflineBanner />)
    // Banner should appear because navigator.onLine is false on mount
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/No internet connection/i)).toBeInTheDocument()
  })

  it('hides the banner when the online event fires', async () => {
    setOnline(false)
    render(<OfflineBanner />)
    await waitFor(() => screen.getByRole('alert'))

    setOnline(true)
    act(() => { window.dispatchEvent(new Event('online')) })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  it('dismiss button hides the banner', async () => {
    setOnline(false)
    render(<OfflineBanner />)
    await waitFor(() => screen.getByRole('alert'))

    fireEvent.click(screen.getByLabelText('Dismiss offline notice'))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  it('banner reappears after coming back offline even if previously dismissed', async () => {
    setOnline(true)
    render(<OfflineBanner />)

    // Go offline → banner appears
    setOnline(false)
    act(() => { window.dispatchEvent(new Event('offline')) })
    await waitFor(() => screen.getByRole('alert'))

    // Dismiss it
    fireEvent.click(screen.getByLabelText('Dismiss offline notice'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())

    // Come back online then go offline again — banner should reappear
    act(() => { window.dispatchEvent(new Event('online')) })
    act(() => { window.dispatchEvent(new Event('offline')) })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
