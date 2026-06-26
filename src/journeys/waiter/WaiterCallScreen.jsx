import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { BellRing, Receipt, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '../../i18n/index'
import { pwaApiService, queuedPost } from '../../core/api/pwaApiService'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectReturnUrl } from '../../core/store/venueConfigSlice'
import { selectSession } from '../../core/store/sessionSlice'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import TouchButton from '../../components/touch/TouchButton'
import PageHeader from '../../components/layout/PageHeader'

const STATUS = {
  CHECKING: 'checking',
  IDLE:     'idle',
  CALLING:  'calling',
  WAITING:  'waiting',
  SUCCESS:  'success',
  ERROR:    'error',
}

const POLL_INTERVAL_MS = 3000

const WaiterCallScreen = ({ onNavigate }) => {
  const { t }                    = useTranslation('waiter')
  const returnUrl                = useSelector(selectReturnUrl)
  const { sessionId, table }     = useSelector(selectSession)
  const [status,   setStatus]   = useState(STATUS.CHECKING)
  const [callType, setCallType] = useState(null) // 'waiter' | 'invoice'
  const [error,    setError]    = useState(null)
  const pollRef = useRef(null)

  // ── Idle timeout ──────────────────────────────────────────────────────────
  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: JOURNEYS.WAITER, session_id: sessionId })
      returnToIdle({ return_url: returnUrl }, sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  // ── Log the waiter page view once the session is ready ────────────────────
  // session_id is required by the backend, so wait until it's set in Redux
  // (set asynchronously after device config + session init on app mount).
  useEffect(() => {
    if (!sessionId) return
    logEvent({ event_type: EVENT_TYPES.PAGE_VIEW, page: JOURNEYS.WAITER, session_id: sessionId })
    logEvent({ event_type: EVENT_TYPES.JOURNEY_START, journey: JOURNEYS.WAITER, session_id: sessionId })
  }, [sessionId])

  // ── On mount: check if either call is already active ─────────────────────
  useEffect(() => {
    const checkOnMount = async () => {
      try {
        const [waiterRes, invoiceRes] = await Promise.all([
          pwaApiService.get('/pwa/waiter-call/status'),
          pwaApiService.get('/pwa/invoice-call/status'),
        ])
        if (waiterRes.data?.data?.active) {
          setCallType('waiter')
          setStatus(STATUS.WAITING)
        } else if (invoiceRes.data?.data?.active) {
          setCallType('invoice')
          setStatus(STATUS.WAITING)
        } else {
          setStatus(STATUS.IDLE)
        }
      } catch {
        setStatus(STATUS.IDLE)
      }
    }
    checkOnMount()
  }, [])

  // ── Poll every 3 s while WAITING ─────────────────────────────────────────
  useEffect(() => {
    if (status !== STATUS.WAITING) return

    const endpoint = callType === 'invoice'
      ? '/pwa/invoice-call/status'
      : '/pwa/waiter-call/status'

    pollRef.current = setInterval(async () => {
      try {
        const res = await pwaApiService.get(endpoint)
        if (!res.data?.data?.active) {
          clearInterval(pollRef.current)
          setStatus(STATUS.SUCCESS)
        }
      } catch {
        // Keep polling silently on network error
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(pollRef.current)
  }, [status, callType])

  // ── Auto-reset to IDLE 3 s after SUCCESS ──────────────────────────────────
  useEffect(() => {
    if (status !== STATUS.SUCCESS) return
    const timer = setTimeout(() => {
      setCallType(null)
      setStatus(STATUS.IDLE)
    }, 3000)
    return () => clearTimeout(timer)
  }, [status])

  // ── Place a call ──────────────────────────────────────────────────────────
  const handleCall = async (type) => {
    if (status === STATUS.CALLING || status === STATUS.WAITING) return
    setCallType(type)
    setStatus(STATUS.CALLING)
    setError(null)
    try {
      if (type === 'waiter') {
        await queuedPost('/pwa/waiter-call', { session_id: sessionId })
        if (sessionId) await logEvent({ event_type: EVENT_TYPES.WAITER_CALLED, session_id: sessionId })
      } else {
        await queuedPost('/pwa/invoice-call', { session_id: sessionId })
        if (sessionId) await logEvent({ event_type: EVENT_TYPES.INVOICE_CALLED, session_id: sessionId })
      }
      setStatus(STATUS.WAITING)
    } catch (err) {
      setError(err?.response?.data?.message ?? t('error_generic'))
      setStatus(STATUS.ERROR)
      setCallType(null)
    }
  }

  // ── Cancel the active call (stop icon) ───────────────────────────────────
  const handleCancel = async () => {
    try {
      if (callType === 'invoice') {
        await pwaApiService.delete('/pwa/invoice-call')
      } else {
        await pwaApiService.delete('/pwa/waiter-call')
      }
    } catch {
      // Ignore — clear locally regardless
    }
    if (sessionId) {
      await logEvent({
        event_type: callType === 'invoice'
          ? EVENT_TYPES.INVOICE_CALL_CANCELLED
          : EVENT_TYPES.WAITER_CALL_CANCELLED,
        session_id: sessionId,
      })
    }
    clearInterval(pollRef.current)
    setStatus(STATUS.IDLE)
    setCallType(null)
    setError(null)
  }

  // ── Colours per call type ─────────────────────────────────────────────────
  const isWaiter  = callType === 'waiter'
  const ringColor = isWaiter ? '#EF4444' : '#F59E0B'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-1 flex-col bg-background">
      <PageHeader
        title={t('title')}
        subtitle={table || t('subtitle')}
        onBack={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
        onCartPress={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
      />

      {/* ── CHECKING ── */}
      {status === STATUS.CHECKING && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-info border-t-transparent" />
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* ── WAITING ── */}
        {status === STATUS.WAITING && (
          <motion.div key="waiting" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="px-5 mt-2">
            <div className="relative overflow-hidden w-full bg-obsidian text-white rounded-[2rem] p-8 text-center shadow-float">
              <div className="absolute -right-10 -top-10 h-40 w-40 blob-mask bg-primary/40 blur-2xl" />
              <div className="relative mx-auto h-20 w-20 flex items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-20" style={{ backgroundColor: ringColor }} />
                <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full opacity-10" style={{ backgroundColor: ringColor, animationDelay: '0.3s' }} />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${ringColor}33` }}>
                  {callType === 'waiter'
                    ? <BellRing className="h-8 w-8" style={{ color: ringColor }} />
                    : <Receipt  className="h-8 w-8" style={{ color: ringColor }} />}
                </div>
              </div>
              <p className="relative mt-5 font-display text-2xl font-black italic">
                {callType === 'waiter' ? t('waiting.waiter_heading') : t('waiting.invoice_heading')}
              </p>
              <p className="relative mt-2 text-sm text-white/70">{t('waiting.message')}</p>
              <div className="relative mt-3 flex items-center justify-center gap-2 text-xs text-white/60">
                <span className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: ringColor }} />
                {t('waiting.status')}
              </div>
              <TouchButton
                onClick={handleCancel}
                aria-label={t('waiting.cancel_label')}
                className="relative mt-5 w-full h-11 rounded-full bg-white/10 border border-white/20 text-white font-semibold text-sm"
              >
                {t('waiting.cancel_label')}
              </TouchButton>
            </div>
          </motion.div>
        )}

        {/* ── SUCCESS ── */}
        {status === STATUS.SUCCESS && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="px-5 mt-2">
            <div className="relative overflow-hidden w-full bg-obsidian text-white rounded-[2rem] p-8 text-center shadow-float">
              <div className="absolute -right-10 -top-10 h-40 w-40 blob-mask bg-primary/40 blur-2xl" />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                className="relative mx-auto h-20 w-20 rounded-full bg-primary flex items-center justify-center shadow-float"
              >
                <Check className="h-10 w-10 text-white" strokeWidth={3} />
              </motion.div>
              <p className="relative mt-5 font-display text-2xl font-black italic">
                {callType === 'waiter' ? t('success.waiter_heading') : t('success.invoice_heading')}
              </p>
              <p className="relative mt-2 text-sm text-white/70">{t('success.message')}</p>
            </div>
          </motion.div>
        )}

        {/* ── IDLE / CALLING / ERROR — two action cards ── */}
        {(status === STATUS.IDLE || status === STATUS.CALLING || status === STATUS.ERROR) && (
          <motion.div key="choices" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-5 mt-2 space-y-4 w-full">
            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            {/* Call Waiter */}
            <motion.div whileTap={{ scale: 0.97 }}>
              <TouchButton
                onClick={() => handleCall('waiter')}
                disabled={status === STATUS.CALLING}
                className="relative w-full text-left bg-primary/10 border border-border rounded-[1.8rem] p-6 shadow-card flex items-center gap-4 overflow-hidden disabled:opacity-60"
              >
                <div className="absolute -right-8 -top-8 h-32 w-32 blob-mask bg-primary/20" />
                <div className="relative h-16 w-16 rounded-full bg-primary flex items-center justify-center text-secondary shadow-soft shrink-0">
                  <BellRing className="h-8 w-8" />
                </div>
                <div className="relative flex-1">
                  <p className="font-display italic font-black text-2xl text-obsidian leading-none">
                    {status === STATUS.CALLING && callType === 'waiter' ? t('calling') : t('call_waiter')}
                  </p>
                  <p className="text-sm text-foreground/70 mt-1.5">{t('idle.waiter_body')}</p>
                </div>
              </TouchButton>
            </motion.div>

            {/* Call for Invoice */}
            <motion.div whileTap={{ scale: 0.97 }}>
              <TouchButton
                onClick={() => handleCall('invoice')}
                disabled={status === STATUS.CALLING}
                className="relative w-full text-left bg-primary/10 border border-border rounded-[1.8rem] p-6 shadow-card flex items-center gap-4 overflow-hidden disabled:opacity-60"
              >
                <div className="absolute -right-8 -top-8 h-32 w-32 blob-mask bg-primary/20" />
                <div className="relative h-16 w-16 rounded-full bg-primary flex items-center justify-center text-secondary shadow-soft shrink-0">
                  <Receipt className="h-8 w-8" />
                </div>
                <div className="relative flex-1">
                  <p className="font-display italic font-black text-2xl text-obsidian leading-none">
                    {status === STATUS.CALLING && callType === 'invoice' ? t('calling') : t('call_invoice')}
                  </p>
                  <p className="text-sm text-foreground/70 mt-1.5">{t('idle.invoice_body')}</p>
                </div>
              </TouchButton>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

export default WaiterCallScreen
