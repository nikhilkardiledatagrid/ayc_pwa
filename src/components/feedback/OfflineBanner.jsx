/**
 * OfflineBanner — sticky top strip shown whenever the device is offline.
 *
 * Listens to BOTH the native window 'online'/'offline' events AND the
 * 'ayc:online'/'ayc:offline' custom events dispatched by pwaAxios.js's
 * response interceptor on every real request outcome. The native events
 * alone are not reliable — navigator.onLine only reflects link-layer
 * connectivity (WiFi/Ethernet associated), not whether requests actually
 * reach the backend, and Chrome/Firefox compute it differently. The custom
 * events reflect what actually happened on the wire, so they're the primary
 * signal; the native events are kept as a fallback/initial-state hint.
 *
 * Rendered once at App root so it covers all journeys.
 *
 * Rules:
 *   - No persistent storage (shared kiosk — CLAUDE.md)
 *   - No hover states (touch device)
 *   - Touch target min 48×48px for dismiss button
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const OfflineBanner = () => {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const goOnline  = () => { setOffline(false); setDismissed(false) }
    const goOffline = () => { setOffline(true);  setDismissed(false) }

    window.addEventListener('online',      goOnline)
    window.addEventListener('offline',     goOffline)
    window.addEventListener('ayc:online',  goOnline)
    window.addEventListener('ayc:offline', goOffline)
    return () => {
      window.removeEventListener('online',      goOnline)
      window.removeEventListener('offline',     goOffline)
      window.removeEventListener('ayc:online',  goOnline)
      window.removeEventListener('ayc:offline', goOffline)
    }
  }, [])

  const visible = offline && !dismissed

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="offline-banner"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{ y: -48,    opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          role="alert"
          aria-live="assertive"
          className="fixed top-0 inset-x-0 z-[200] flex items-center justify-between gap-3 bg-obsidian px-5 py-3 shadow-float"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            <p className="text-[13px] font-semibold text-white">
              No internet connection — some features may be unavailable
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss offline notice"
            className="min-h-[48px] min-w-[48px] flex items-center justify-center text-white/70 active:text-white transition-colors shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default OfflineBanner
