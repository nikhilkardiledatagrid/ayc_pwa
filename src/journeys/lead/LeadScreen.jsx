import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { motion } from 'framer-motion'
import { Sparkles, Phone, Mail } from 'lucide-react'
import { useTranslation } from '../../i18n/index'
import { queuedPost } from '../../core/api/pwaApiService'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectReturnUrl, selectJourneyConfig } from '../../core/store/venueConfigSlice'
import { selectSession } from '../../core/store/sessionSlice'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import { validateRequired, validatePhone, validateEmail } from '../../core/utils/validators'
import TouchButton from '../../components/touch/TouchButton'
import NotConfiguredState from '../../components/feedback/NotConfiguredState'

const STATE = { FORM: 'FORM', LOADING: 'LOADING', SUCCESS: 'SUCCESS', ERROR: 'ERROR' }

const LeadScreen = () => {
  const { t }     = useTranslation('lead')
  const returnUrl = useSelector(selectReturnUrl)
  const journeyConfig = useSelector(selectJourneyConfig)
  const session   = useSelector(selectSession)

  // Treat as configured until config loads (null) — only block once we know the
  // venue has no active loyalty form set up.
  const loyaltyConfigured = journeyConfig ? !!journeyConfig.loyalty : true

  const [state,       setState]       = useState(STATE.FORM)
  const [countryCode, setCountryCode] = useState('+971')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [errorMsg,    setErrorMsg]    = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: JOURNEYS.LEAD, session_id: session?.sessionId })
      returnToIdle({ return_url: returnUrl }, session?.sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, session?.sessionId])

  useEffect(() => {
    if (!session?.sessionId) return
    logEvent({ event_type: EVENT_TYPES.PAGE_VIEW,     page:    JOURNEYS.LEAD, session_id: session.sessionId })
    logEvent({ event_type: EVENT_TYPES.JOURNEY_START, journey: JOURNEYS.LEAD, session_id: session.sessionId })
  }, [session?.sessionId])

  const validate = () => {
    const e = {}
    const countryCodeErr = validateRequired(countryCode, t('form.error_country_code_required'))
    const phoneErr = validateRequired(phone, t('form.error_phone_required'))
      ?? validatePhone(phone, t('form.error_phone_invalid'))
    const emailErr = validateEmail(email, t('form.error_email_invalid'))
    if (countryCodeErr) e.countryCode = countryCodeErr
    if (phoneErr)       e.phone       = phoneErr
    if (emailErr)       e.email       = emailErr
    return e
  }

  const handleSubmit = async () => {
    const e = validate()
    if (Object.keys(e).length) { setFieldErrors(e); return }
    setFieldErrors({})
    setState(STATE.LOADING)
    setErrorMsg('')
    try {
      await queuedPost('/pwa/capture/loyalty', {
        phone_number:  `${countryCode.trim()}${phone.trim()}`,
        email_address: email.trim() || null,
        session_id:  session?.sessionId ?? null,
        screen_id:   session?.screenId  ?? null,
      })
      setState(STATE.SUCCESS)
      if (session?.sessionId) {
        await logEvent({ event_type: EVENT_TYPES.LEAD_SUBMITTED,  session_id: session.sessionId })
        await logEvent({ event_type: EVENT_TYPES.JOURNEY_COMPLETE, journey: JOURNEYS.LEAD, session_id: session.sessionId })
      }
    } catch (err) {
      setErrorMsg(err?.response?.data?.message ?? t('form.error_generic'))
      setState(STATE.ERROR)
    }
  }

  const handleReset = () => {
    setState(STATE.FORM)
    setCountryCode('+971')
    setPhone('')
    setEmail('')
    setErrorMsg('')
    setFieldErrors({})
  }

  // ── INPUT base class ──────────────────────────────────────────────────────
  const inputCls = (hasErr) =>
    `w-full h-12 rounded-2xl bg-[#EFEFEF] px-4 text-[14px] text-input-text placeholder:text-[#888] outline-none focus:ring-2 focus:ring-primary/30 border transition-colors ${hasErr ? 'border-red-400' : 'border-border'}`

  // ── Not configured: venue has no active loyalty form ───────────────────────
  if (!loyaltyConfigured) {
    return (
      <div className="relative flex flex-1 flex-col bg-background">
        <div className="absolute -top-10 -right-20 h-64 w-64 blob-mask bg-blush/60 -z-10" />
        <div className="absolute top-32 -left-24 h-52 w-52 blob-mask-2 bg-peach/50 -z-10" />
        <NotConfiguredState title={t('not_configured.title')} message={t('not_configured.message')} />
      </div>
    )
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (state === STATE.SUCCESS) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center bg-background min-h-[80vh] text-center px-6">
        <div className="absolute -top-10 -right-20 h-64 w-64 blob-mask bg-blush/60 -z-10" />
        <div className="absolute top-32 -left-24 h-52 w-52 blob-mask-2 bg-peach/50 -z-10" />
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 14 }}
          className="h-24 w-24 rounded-full bg-gradient-to-r from-primary to-primary/80 flex items-center justify-center shadow-float"
        >
          <Sparkles className="h-12 w-12 text-white" />
        </motion.div>
        <h1 className="mt-6 text-3xl font-display font-black tracking-tight text-obsidian">{t('success.heading')}</h1>
        <p className="mt-3 text-fg-muted max-w-xs">{t('success.subheading')}</p>
        <TouchButton
          onClick={handleReset}
          className="mt-8 h-14 px-8 rounded-full bg-gradient-to-r from-primary to-primary/80 text-button-text font-bold shadow-float"
        >
          {t('success.start_over')}
        </TouchButton>
      </div>
    )
  }

  // ── FORM / LOADING / ERROR ─────────────────────────────────────────────────
  return (
    <div className="relative flex flex-1 flex-col bg-background">
      <div className="absolute -top-10 -right-20 h-64 w-64 blob-mask bg-blush/60 -z-10" />
      <div className="absolute top-40 -left-24 h-52 w-52 blob-mask-2 bg-peach/50 -z-10" />

      {/* Promo banner */}
      <div className="px-5 pt-5">
        <div className="relative overflow-hidden rounded-[1.8rem] bg-primary/10 border border-primary/10 shadow-card p-5">
          <div className="absolute -right-8 -top-8 h-32 w-32 blob-mask bg-primary/15 blur-2xl" />
          <span className="inline-block text-[9px] tracking-[0.18em] font-black px-2.5 py-1 rounded-full bg-primary text-white">
            {t('promo_badge', { defaultValue: 'EXCLUSIVE OFFER' })}
          </span>
          <h2 className="mt-2 font-display italic font-black text-xl text-obsidian">{t('form.heading')}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t('form.subheading')}</p>

          {/* Benefits — venue-configured copy from the Form Builder's "benefits" field */}
          {journeyConfig?.loyalty_benefits && (
            <div className="mt-3 pt-3 border-t border-obsidian/10">
              <p className="font-display italic font-black text-base text-obsidian">{t('benefits_title')}</p>
              <p className="mt-1 text-sm text-fg-muted whitespace-pre-line">{journeyConfig.loyalty_benefits}</p>
            </div>
          )}
        </div>
      </div>

      {/* Form card */}
      <div className="px-5 mt-4 space-y-4">
        <div className="bg-card rounded-3xl p-5 border border-border shadow-card space-y-3">

          {/* Phone row: country code + number */}
          <div>
            <div className="flex gap-2">
              <div className="relative shrink-0 w-20">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted pointer-events-none" />
                <input
                  type="tel"
                  value={countryCode}
                  onChange={(e) => { setCountryCode(e.target.value); setFieldErrors((p) => ({ ...p, countryCode: undefined })) }}
                  placeholder="+971"
                  aria-label="Country code"
                  className={`w-full h-12 rounded-2xl bg-[#EFEFEF] pl-8 pr-2 text-[13px] text-input-text placeholder:text-[#888] outline-none focus:ring-2 focus:ring-primary/30 border transition-colors ${fieldErrors.countryCode ? 'border-red-400' : 'border-border'}`}
                />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setFieldErrors((p) => ({ ...p, phone: undefined })) }}
                placeholder={t('form.phone_placeholder')}
                aria-label="Phone number"
                className={`flex-1 ${inputCls(fieldErrors.phone)}`}
              />
            </div>
            {(fieldErrors.countryCode || fieldErrors.phone) && (
              <p className="mt-1 text-[12px] text-red-400">{fieldErrors.countryCode ?? fieldErrors.phone}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-muted pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })) }}
                placeholder={t('form.email_placeholder')}
                aria-label="Email address"
                className={`w-full h-12 rounded-2xl bg-[#EFEFEF] pl-9 pr-4 text-[14px] text-input-text placeholder:text-[#888] outline-none focus:ring-2 focus:ring-primary/30 border transition-colors ${fieldErrors.email ? 'border-red-400' : 'border-border'}`}
              />
            </div>
            {fieldErrors.email && (
              <p className="mt-1 text-[12px] text-red-400">{fieldErrors.email}</p>
            )}
          </div>

          {/* Generic error */}
          {state === STATE.ERROR && errorMsg && (
            <p className="text-center text-[12px] text-red-400">{errorMsg}</p>
          )}
        </div>

        {/* Submit */}
        <motion.div whileTap={{ scale: 0.97 }}>
          <TouchButton
            onClick={handleSubmit}
            disabled={state === STATE.LOADING}
            className="w-full h-14 rounded-full bg-gradient-to-r from-primary to-primary/80 text-button-text font-bold shadow-float flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {state === STATE.LOADING
              ? <><div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />{t('loading')}</>
              : <><Sparkles className="h-5 w-5" />{t('form.submit')}</>
            }
          </TouchButton>
        </motion.div>
      </div>
    </div>
  )
}

export default LeadScreen
