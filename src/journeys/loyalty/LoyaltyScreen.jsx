import { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useTranslation } from '../../i18n/index'
import { queuedPost } from '../../core/api/pwaApiService'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { restartSession } from '../../core/utils/sessionManager'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectReturnUrl, selectSessionTtlMs } from '../../core/store/venueConfigSlice'
import { selectSession, setSession } from '../../core/store/sessionSlice'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import { useGuestProfile } from '../../core/utils/guestProfile'
import TouchButton from '../../components/touch/TouchButton'
import PageHeader from '../../components/layout/PageHeader'

const STATE = { FORM: 'form', SUBMITTING: 'submitting', THANKS: 'thanks' }

const FIELDS = ['name', 'email', 'phone', 'city']

// Fields prefilled/locked from the shared guest profile (see useGuestProfile) —
// email and city are loyalty-specific and always stay editable.
const PROFILE_FIELDS = ['name', 'phone']

const LoyaltyScreen = ({ onNavigate }) => {
  const { t }     = useTranslation('loyalty')
  const dispatch  = useDispatch()
  const returnUrl = useSelector(selectReturnUrl)
  const sessionTtlMs = useSelector(selectSessionTtlMs)
  const { sessionId, table, scenario } = useSelector(selectSession)
  const { profile, save: saveGuestProfile, clear: clearGuestProfile } = useGuestProfile()
  const locked = !!(profile?.first_name && profile?.last_name && profile?.mobile)

  const profileName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : ''

  const [state,     setState]     = useState(STATE.FORM)
  // Draft state — while locked, name/phone display (and submit) the saved
  // profile instead, derived below rather than synced via an effect.
  const [formDraft, setFormDraft] = useState({ name: '', email: '', phone: '', city: '' })
  const [errMsg,    setErrMsg]    = useState(null)

  const form = {
    ...formDraft,
    name:  locked ? profileName     : formDraft.name,
    phone: locked ? profile.mobile  : formDraft.phone,
  }
  const setForm = setFormDraft

  const handleClearSavedInfo = async () => {
    clearGuestProfile()
    setFormDraft((prev) => ({ ...prev, name: '', phone: '' }))
    // Whoever clears a wrongly-resumed profile isn't the guest the current
    // session belongs to either — rotate the session id along with it.
    const newSessionId = await restartSession(sessionId, { table, scenario, sessionTtlMs })
    dispatch(setSession({ sessionId: newSessionId }))
  }

  // Idle timeout
  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: JOURNEYS.LOYALTY, session_id: sessionId })
      returnToIdle({ return_url: returnUrl }, sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  useEffect(() => {
    if (!sessionId) return
    logEvent({ event_type: EVENT_TYPES.PAGE_VIEW, page: JOURNEYS.LOYALTY, session_id: sessionId })
    logEvent({ event_type: EVENT_TYPES.JOURNEY_START, journey: JOURNEYS.LOYALTY, session_id: sessionId })
  }, [sessionId])

  // ── Step dwell ─────────────────────────────────────────────────────────────
  const stepDwellStartRef = useRef(null)
  useEffect(() => {
    stepDwellStartRef.current = Date.now()
    const currentStep = state
    return () => {
      if (sessionId) {
        logEvent({
          event_type: EVENT_TYPES.STEP_DWELL,
          journey: JOURNEYS.LOYALTY,
          step: currentStep,
          dwell_ms: Date.now() - stepDwellStartRef.current,
          session_id: sessionId,
        })
      }
    }
  }, [state, sessionId])

  const handleSubmit = async () => {
    setState(STATE.SUBMITTING)
    setErrMsg(null)
    try {
      await queuedPost('/pwa/loyalty/enrol', {
        ...form,
        session_id: sessionId,
      })
      const [first_name, ...rest] = form.name.trim().split(/\s+/)
      if (first_name) saveGuestProfile({ first_name, last_name: rest.join(' '), mobile: form.phone })
      if (sessionId) {
        await logEvent({
          event_type: EVENT_TYPES.JOURNEY_COMPLETE,
          journey:    JOURNEYS.LOYALTY,
          name:       form.name,
          email:      form.email,
          phone:      form.phone,
          city:       form.city,
          session_id: sessionId,
        })
      }
      setState(STATE.THANKS)
    } catch (err) {
      const msg = err?.response?.data?.message
      setErrMsg(msg ?? t('error_generic'))
      setState(STATE.FORM)
    }
  }

  // ── THANKS ────────────────────────────────────────────────────────────────
  if (state === STATE.THANKS) {
    return (
      <div className="relative flex flex-1 flex-col bg-background overflow-hidden">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          onBack={() => setState(STATE.FORM)}
          onCartPress={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
        />
        <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 180, damping: 14 }}
            className="h-24 w-24 rounded-full bg-gradient-primary flex items-center justify-center shadow-float"
          >
            <Sparkles className="h-12 w-12 text-white" />
          </motion.div>
          <h1 className="mt-6 text-3xl font-display font-black tracking-tight text-obsidian">{t('thanks_heading')}</h1>
          <p className="mt-3 text-muted-foreground max-w-xs">{t('thanks_body')}</p>
          <TouchButton
            onClick={() => returnToIdle({ return_url: returnUrl }, sessionId, 'journey_complete')}
            className="mt-8 h-14 px-8 rounded-full bg-gradient-primary text-white font-bold shadow-float"
          >
            {t('back_home')}
          </TouchButton>
        </div>
      </div>
    )
  }

  // ── FORM ──────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-1 flex-col bg-background">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        onBack={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
        onCartPress={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
      />

      <div className="px-5 space-y-4">
        {/* Promo banner */}
        <div className="relative overflow-hidden rounded-[1.8rem] bg-gradient-hero border border-primary/10 shadow-card p-5">
          <div className="absolute -right-8 -top-8 h-32 w-32 blob-mask bg-primary/15 blur-2xl" />
          <span className="inline-block text-[9px] tracking-[0.18em] font-black px-2.5 py-1 rounded-full bg-primary text-white">
            {t('promo_badge')}
          </span>
          <h2 className="mt-2 font-display italic font-black text-xl text-obsidian">{t('promo_title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('promo_body')}</p>
        </div>

        {/* Form card */}
        <div className="bg-card rounded-3xl p-5 border border-border shadow-card space-y-3">
          {FIELDS.map((key) => (
            <input
              key={key}
              type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
              value={form[key]}
              disabled={locked && PROFILE_FIELDS.includes(key)}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={t(`${key}_placeholder`)}
              className="w-full h-12 rounded-2xl bg-[#EFEFEF] px-4 text-[14px] text-input-text placeholder:text-[#888] outline-none focus:ring-2 focus:ring-primary/30 border border-border disabled:opacity-60"
            />
          ))}
          {locked && (
            <TouchButton
              onClick={handleClearSavedInfo}
              className="inline-flex items-center justify-start px-1 text-[12px] font-semibold text-primary underline underline-offset-2"
            >
              {t('clear_saved_info')}
            </TouchButton>
          )}
          {errMsg && <p className="text-center text-[12px] text-destructive">{errMsg}</p>}
        </div>

        <motion.div whileTap={{ scale: 0.97 }}>
          <TouchButton
            onClick={handleSubmit}
            disabled={state === STATE.SUBMITTING}
            className="w-full h-14 rounded-full bg-gradient-primary text-button-text font-bold shadow-float flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Sparkles className="h-5 w-5" />
            {state === STATE.SUBMITTING ? t('submitting') : t('submit')}
          </TouchButton>
        </motion.div>
      </div>
    </div>
  )
}

export default LoyaltyScreen
