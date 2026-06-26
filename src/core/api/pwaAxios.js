/**
 * Central Axios instance for the AYC PWA.
 *
 * Auth: X-Device-Token (not Bearer JWT — this is a device, not a user).
 * Token source: ayc_device_config in localStorage (set during device pairing).
 *
 * DO NOT regenerate this file. Contact Rushiraj if behaviour must change.
 */

import axios from 'axios'
import { getDeviceConfig } from '../utils/deviceConfig'

const pwaAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-App-Token': import.meta.env.VITE_API_STATIC_TOKEN,
  },
})

// Read device_token from localStorage on every request.
pwaAxios.interceptors.request.use(
  (config) => {
    const token = getDeviceConfig()?.device_token
    if (token) {
      config.headers['X-Device-Token'] = token
    }
    return config
  },
  (error) => Promise.reject(error),
)

pwaAxios.interceptors.response.use(
  (response) => {
    // Any successful response is the most reliable "we're actually online"
    // signal there is — more reliable than navigator.onLine, which only
    // reflects link-layer connectivity (WiFi/Ethernet associated), not
    // whether requests actually reach the backend. Chrome in particular can
    // report navigator.onLine === true while every real request fails.
    window.dispatchEvent(new CustomEvent('ayc:online'))
    return response
  },
  (error) => {
    if (!error.response) {
      // Network failure with no HTTP response at all — the real "offline"
      // signal, independent of navigator.onLine. OfflineBanner listens for
      // this directly now (see OfflineBanner.jsx); eventQueue/safeFetch
      // callers still handle their own queueing/fallback behavior.
      window.dispatchEvent(new CustomEvent('ayc:offline'))
      return Promise.reject(error)
    }

    const { status } = error.response

    if (status === 401) {
      // Device token invalid or expired — signal App to show misconfiguration screen
      window.dispatchEvent(new CustomEvent('ayc:device-token-invalid'))
    }

    return Promise.reject(error)
  },
)

export default pwaAxios
