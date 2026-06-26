import { describe, it, expect, vi } from 'vitest'
import pwaAxios from '../core/api/pwaAxios'

// Reach into axios's interceptor manager to unit-test the registered
// fulfilled/rejected handlers directly, without a real HTTP transport —
// pwaAxios.js registers exactly one response interceptor.
const { fulfilled, rejected } = pwaAxios.interceptors.response.handlers[0]

const listenOnce = (eventName) => {
  const listener = vi.fn()
  window.addEventListener(eventName, listener)
  return { listener, stop: () => window.removeEventListener(eventName, listener) }
}

describe('pwaAxios response interceptor', () => {
  it('dispatches ayc:online on every successful response', () => {
    const { listener, stop } = listenOnce('ayc:online')
    const response = { status: 200, data: {} }

    expect(fulfilled(response)).toBe(response)
    expect(listener).toHaveBeenCalledOnce()
    stop()
  })

  it('dispatches ayc:offline on a network error with no HTTP response at all', async () => {
    const { listener, stop } = listenOnce('ayc:offline')
    const netError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })

    await expect(rejected(netError)).rejects.toThrow('Network Error')
    expect(listener).toHaveBeenCalledOnce()
    stop()
  })

  it('does not dispatch ayc:offline for a real 4xx/5xx error (a response did arrive)', async () => {
    const { listener, stop } = listenOnce('ayc:offline')
    const serverError = Object.assign(new Error('Server Error'), { response: { status: 500 } })

    await expect(rejected(serverError)).rejects.toThrow('Server Error')
    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('dispatches ayc:device-token-invalid on a 401', async () => {
    const { listener, stop } = listenOnce('ayc:device-token-invalid')
    const authError = Object.assign(new Error('Unauthorized'), { response: { status: 401 } })

    await expect(rejected(authError)).rejects.toThrow('Unauthorized')
    expect(listener).toHaveBeenCalledOnce()
    stop()
  })

  it('does not dispatch ayc:device-token-invalid for non-401 response errors', async () => {
    const { listener, stop } = listenOnce('ayc:device-token-invalid')
    const notFound = Object.assign(new Error('Not Found'), { response: { status: 404 } })

    await expect(rejected(notFound)).rejects.toThrow('Not Found')
    expect(listener).not.toHaveBeenCalled()
    stop()
  })
})
