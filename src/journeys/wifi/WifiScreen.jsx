import { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Wifi, Copy, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from '../../i18n/index'
import { pwaApiService, safeFetch, queuedPost } from '../../core/api/pwaApiService'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { restartSession } from '../../core/utils/sessionManager'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectReturnUrl, selectSessionTtlMs } from '../../core/store/venueConfigSlice'
import { selectSession, selectSessionId, setSession } from '../../core/store/sessionSlice'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import { validateRequired, validatePhone } from '../../core/utils/validators'
import { useGuestProfile, splitMobile } from '../../core/utils/guestProfile'
import TouchButton from '../../components/touch/TouchButton'
import PageHeader from '../../components/layout/PageHeader'

// ── QR string builder ─────────────────────────────────────────────────────────
// Format: WIFI:T:{security};S:{ssid};P:{password};; (iOS/Android native support)
const buildWifiQrString = ({ ssid, password, security_type }) => {
  const sec = security_type === 'nopass' ? 'nopass' : security_type ?? 'WPA'
  const pw  = sec === 'nopass' ? '' : `P:${password ?? ''};`
  return `WIFI:T:${sec};S:${ssid};${pw};`
}

// ── Swipe Slider ──────────────────────────────────────────────────────────────
const Slider = ({ configs, onBack, onNavigate, t }) => {
  const [index,      setIndex]      = useState(0)
  const [dragX,      setDragX]      = useState(0)
  const [sliding,    setSliding]    = useState(false)
  const [copiedIdx,  setCopiedIdx]  = useState(null)
  const touchStartX = useRef(null)
  const total = configs.length

  const goTo = (i) => {
    setDragX(0)
    setSliding(true)
    setIndex(Math.max(0, Math.min(total - 1, i)))
  }
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; setSliding(false) }
  const onTouchMove  = (e) => {
    if (touchStartX.current === null) return
    const diff = e.touches[0].clientX - touchStartX.current
    const atEdge = (index === 0 && diff > 0) || (index === total - 1 && diff < 0)
    setDragX(atEdge ? diff * 0.2 : diff)
  }
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    goTo(diff > 40 ? index + 1 : diff < -40 ? index - 1 : index)
    touchStartX.current = null
  }

  const handleCopy = (cfg, i) => {
    const text = cfg.password ?? cfg.ssid
    navigator.clipboard?.writeText(text)
    setCopiedIdx(i)
    setTimeout(() => setCopiedIdx(null), 1500)
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title={t('title')}
        subtitle={total > 1 ? t('slider.network_counter', { current: index + 1, total }) : t('subtitle')}
        onBack={onBack}
        onCartPress={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
      />

      {/* Sliding cards */}
      <div
        className="flex-1 overflow-hidden select-none mt-2"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(-${index * 100}% + ${dragX}px))`,
            transition: sliding ? 'transform 0.3s ease-in-out' : 'none',
            willChange: 'transform',
          }}
        >
          {configs.map((cfg, i) => {
            const qrValue = buildWifiQrString(cfg)
            const isOpen  = cfg.security_type === 'nopass'
            const hasPassword = !isOpen && cfg.password

            return (
              <div key={cfg.id} style={{ minWidth: '100%' }} className="px-5 overflow-y-auto">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-hero rounded-3xl p-6 border border-primary/10 shadow-card text-center"
                >
                  {/* WiFi icon */}
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-card flex items-center justify-center shadow-soft">
                    <Wifi className="h-7 w-7 text-primary" />
                  </div>

                  {/* Heading */}
                  <h2 className="mt-4 text-xl font-bold text-obsidian">{t('slider.you_are_set')}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t('slider.scan_or_password')}</p>

                  {/* QR Code */}
                  <div className="mt-5 mx-auto bg-card rounded-3xl p-4 inline-block shadow-card">
                    <QRCodeSVG value={qrValue} size={192} level="M" />
                  </div>

                  {/* Network info row */}
                  <div className="mt-5 bg-card rounded-2xl p-4 flex items-center justify-between border border-border text-left gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{t('slider.network_label')}</p>
                      <p className="font-bold text-fg truncate">{cfg.ssid}</p>
                    </div>
                    {hasPassword && (
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{t('slider.password_label')}</p>
                        <p className="font-bold font-mono text-fg truncate">{cfg.password}</p>
                      </div>
                    )}
                    {isOpen && (
                      <div>
                        <p className="text-xs text-muted-foreground">{t('slider.security_label')}</p>
                        <p className="text-sm text-muted-foreground">{t('slider.open_network')}</p>
                      </div>
                    )}
                    <TouchButton
                      onClick={() => handleCopy(cfg, i)}
                      aria-label="Copy"
                      className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0"
                    >
                      {copiedIdx === i
                        ? <Check className="h-5 w-5" />
                        : <Copy className="h-5 w-5" />}
                    </TouchButton>
                  </div>
                </motion.div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Dot indicators for multiple networks */}
      {total > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-2 pb-6 select-none">
          {configs.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all duration-200 ${i === index ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Guest Info Form ───────────────────────────────────────────────────────────
const GuestForm = ({ configs, onSuccess, onNavigate, t }) => {
  const dispatch = useDispatch()
  const { sessionId, table, scenario } = useSelector(selectSession)
  const sessionTtlMs = useSelector(selectSessionTtlMs)
  const { profile, save: saveGuestProfile, clear: clearGuestProfile } = useGuestProfile()
  const locked = !!(profile?.first_name && profile?.last_name && profile?.mobile)
  const lockedMobile = profile?.mobile ? splitMobile(profile.mobile) : null

  // Draft state holds what the guest is actively typing. While locked, the
  // inputs display (and submit) the saved profile instead — derived below,
  // not synced via an effect, so it always reflects sessionId resolving late.
  const [firstNameDraft, setFirstNameDraft] = useState('')
  const [lastNameDraft, setLastNameDraft]   = useState('')
  const [countryCodeDraft, setCountryCodeDraft] = useState('+971')
  const [mobileDraft, setMobileDraft]       = useState('')
  const [errors, setErrors]       = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)

  const firstName   = locked ? profile.first_name       : firstNameDraft
  const lastName    = locked ? profile.last_name        : lastNameDraft
  const countryCode = locked ? lockedMobile.countryCode : countryCodeDraft
  const mobile       = locked ? lockedMobile.mobile      : mobileDraft
  const setFirstName   = setFirstNameDraft
  const setLastName    = setLastNameDraft
  const setCountryCode = setCountryCodeDraft
  const setMobile       = setMobileDraft

  const handleClear = async () => {
    clearGuestProfile()
    setFirstNameDraft('')
    setLastNameDraft('')
    setCountryCodeDraft('+971')
    setMobileDraft('')
    // Whoever clears a wrongly-resumed profile isn't the guest the current
    // session belongs to either — rotate the session id along with it.
    const newSessionId = await restartSession(sessionId, { table, scenario, sessionTtlMs })
    dispatch(setSession({ sessionId: newSessionId }))
  }

  const validate = () => {
    const e = {}
    const firstNameErr   = validateRequired(firstName, t('form.error_first_name_required'))
    const lastNameErr    = validateRequired(lastName, t('form.error_last_name_required'))
    const countryCodeErr = validateRequired(countryCode, t('form.error_country_code_required'))
    const mobileErr = validateRequired(mobile, t('form.error_mobile_required'))
      ?? validatePhone(mobile, t('form.error_mobile_invalid'))
    if (firstNameErr)   e.firstName   = firstNameErr
    if (lastNameErr)    e.lastName    = lastNameErr
    if (countryCodeErr) e.countryCode = countryCodeErr
    if (mobileErr)      e.mobile      = mobileErr
    return e
  }

  const handleSubmit = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }

    setErrors({})
    setSubmitting(true)
    setServerError(null)

    try {
      // Use the first SSID as the log reference — all networks are shown after
      const ssid = configs[0]?.ssid ?? 'unknown'
      const fullMobile = `${countryCode.trim()}${mobile.trim()}`
      await queuedPost('/pwa/wifi/log', {
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        mobile:    fullMobile,
        ssid,
      })
      saveGuestProfile({ first_name: firstName.trim(), last_name: lastName.trim(), mobile: fullMobile })
      if (sessionId) {
        await logEvent({
          event_type: EVENT_TYPES.WIFI_REQUESTED,
          ssid,
          first_name: firstName.trim(),
          last_name:  lastName.trim(),
          mobile:     fullMobile,
          session_id: sessionId,
        })
      }
      onSuccess()
    } catch (err) {
      const msg = err?.response?.data?.message
      setServerError(msg ?? t('form.error_generic'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex flex-1 flex-col">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        onBack={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
        onCartPress={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
      />

      <div className="px-5 mt-2 space-y-4">
        <p className="font-display text-xl font-black italic text-obsidian">{t('form.heading')}</p>
        <p className="text-sm text-muted-foreground">{t('form.description')}</p>

        {/* Form card */}
        <div className="w-full bg-card rounded-3xl border border-border shadow-card p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold text-fg-muted uppercase tracking-[0.12em]">{t('form.name_label')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={firstName}
                disabled={locked}
                onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, firstName: undefined })) }}
                placeholder={t('form.first_name_placeholder')}
                aria-label={t('form.first_name_placeholder')}
                className={`flex-1 min-w-0 h-12 rounded-2xl bg-[#EFEFEF] px-4 text-[14px] text-input-text placeholder:text-[#888] outline-none focus:ring-2 focus:ring-info/40 border transition-colors disabled:opacity-60 ${errors.firstName ? 'border-destructive' : 'border-border'}`}
              />
              <input
                type="text"
                value={lastName}
                disabled={locked}
                onChange={(e) => { setLastName(e.target.value); setErrors((p) => ({ ...p, lastName: undefined })) }}
                placeholder={t('form.last_name_placeholder')}
                aria-label={t('form.last_name_placeholder')}
                className={`flex-1 min-w-0 h-12 rounded-2xl bg-[#EFEFEF] px-4 text-[14px] text-input-text placeholder:text-[#888] outline-none focus:ring-2 focus:ring-info/40 border transition-colors disabled:opacity-60 ${errors.lastName ? 'border-destructive' : 'border-border'}`}
              />
            </div>
            {(errors.firstName || errors.lastName) && <p className="mt-1 text-[11px] text-destructive">{errors.firstName ?? errors.lastName}</p>}
          </div>

          {/* Mobile */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold text-fg-muted uppercase tracking-[0.12em]">{t('form.mobile_label')}</label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={countryCode}
                disabled={locked}
                onChange={(e) => { setCountryCode(e.target.value); setErrors((p) => ({ ...p, countryCode: undefined })) }}
                placeholder={t('form.country_code_placeholder')}
                aria-label={t('form.country_code_label')}
                className={`w-20 shrink-0 h-12 rounded-2xl bg-[#EFEFEF] px-3 text-[14px] text-input-text placeholder:text-[#888] outline-none focus:ring-2 focus:ring-info/40 border transition-colors disabled:opacity-60 ${errors.countryCode ? 'border-destructive' : 'border-border'}`}
              />
              <input
                type="tel"
                value={mobile}
                disabled={locked}
                onChange={(e) => { setMobile(e.target.value); setErrors((p) => ({ ...p, mobile: undefined })) }}
                placeholder={t('form.mobile_placeholder')}
                className={`flex-1 min-w-0 h-12 rounded-2xl bg-[#EFEFEF] px-4 text-[14px] text-input-text placeholder:text-[#888] outline-none focus:ring-2 focus:ring-info/40 border transition-colors disabled:opacity-60 ${errors.mobile ? 'border-destructive' : 'border-border'}`}
              />
            </div>
            {(errors.countryCode || errors.mobile) && <p className="mt-1 text-[11px] text-destructive">{errors.countryCode ?? errors.mobile}</p>}
          </div>

          {locked && (
            <TouchButton
              onClick={handleClear}
              className="inline-flex items-center justify-start px-1 text-[12px] font-semibold text-primary underline underline-offset-2"
            >
              {t('form.clear_saved_info')}
            </TouchButton>
          )}

          {serverError && <p className="text-center text-[12px] text-destructive">{serverError}</p>}
        </div>

        <TouchButton
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-4 w-full h-14 rounded-full bg-gradient-to-r from-primary to-primary/80 text-button-text font-bold text-[15px] shadow-float active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {submitting ? t('form.submitting') : t('form.submit')}
        </TouchButton>
      </div>
    </div>
  )
}

// ── Loading / Empty states ────────────────────────────────────────────────────
const LoadingState = ({ t }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-info border-t-transparent" />
    <p className="text-[13px] text-fg-muted">{t('loading')}</p>
  </div>
)

const NoWifiState = ({ t }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border shadow-card">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <circle cx="12" cy="20" r="1" fill="currentColor" />
      </svg>
    </div>
    <p className="font-display text-[16px] font-bold text-fg">{t('no_wifi.title')}</p>
    <p className="text-center text-[13px] text-fg-muted">{t('no_wifi.message')}</p>
  </div>
)

const FetchErrorState = ({ t }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border shadow-card">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    </div>
    <p className="font-display text-[16px] font-bold text-fg">{t('fetch_error.title')}</p>
    <p className="text-center text-[13px] text-fg-muted">{t('fetch_error.message')}</p>
  </div>
)

// ── Main Screen ───────────────────────────────────────────────────────────────
const WifiScreen = ({ onNavigate }) => {
  const { t }     = useTranslation('wifi')
  const returnUrl = useSelector(selectReturnUrl)
  const sessionId = useSelector(selectSessionId)

  const [step, setStep]       = useState('form')   // 'form' | 'slider'
  const [configs, setConfigs] = useState(null)      // null = loading, [] = empty, [...] = loaded
  const [fetchError, setFetchError] = useState(false)

  // ── Session idle timeout ───────────────────────────────────────────────────
  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: JOURNEYS.WIFI, session_id: sessionId })
      returnToIdle({ return_url: returnUrl }, sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  // ── Log the wifi page view once the session is ready ──────────────────────
  // session_id is required by the backend, so wait until it's set in Redux
  // (set asynchronously after device config + session init on app mount).
  useEffect(() => {
    if (!sessionId) return
    logEvent({ event_type: EVENT_TYPES.PAGE_VIEW, page: JOURNEYS.WIFI, session_id: sessionId })
    logEvent({ event_type: EVENT_TYPES.JOURNEY_START, journey: JOURNEYS.WIFI, session_id: sessionId })
  }, [sessionId])

  // ── Step dwell ─────────────────────────────────────────────────────────────
  const stepDwellStartRef = useRef(null)
  useEffect(() => {
    stepDwellStartRef.current = Date.now()
    const currentStep = step
    return () => {
      if (sessionId) {
        logEvent({
          event_type: EVENT_TYPES.STEP_DWELL,
          journey: JOURNEYS.WIFI,
          step: currentStep,
          dwell_ms: Date.now() - stepDwellStartRef.current,
          session_id: sessionId,
        })
      }
    }
  }, [step, sessionId])

  // ── Fetch WiFi configs on mount ────────────────────────────────────────────
  // safeFetch() only returns its null fallback when navigator.onLine is false
  // at call time — if that flag is stale (e.g. Chrome reporting "online" while
  // the request still fails with ERR_NETWORK), it re-throws instead. Without
  // this catch that rejection was unhandled and configs stayed null forever,
  // leaving the screen stuck on the loading spinner.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await safeFetch(() => pwaApiService.get('/pwa/wifi'), null)
        if (res === null) { setFetchError(true); setConfigs([]); return }
        setConfigs(res.data?.data ?? [])
      } catch {
        setFetchError(true)
        setConfigs([])
      }
    }
    load()
  }, [])

  const handleFormSuccess = () => {
    logEvent({ event_type: EVENT_TYPES.WIFI_QR_SHOWN, session_id: sessionId })
    logEvent({ event_type: EVENT_TYPES.JOURNEY_COMPLETE, journey: JOURNEYS.WIFI, session_id: sessionId })
    setStep('slider')
  }
  const handleBack        = () => setStep('form')

  const isLoading  = configs === null
  const hasConfigs = configs?.length > 0

  return (
    <div className="flex flex-1 flex-col bg-background">
      {isLoading && (
        <>
          <PageHeader
            title={t('title')}
            subtitle={t('subtitle')}
            onBack={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
            onCartPress={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
          />
          <LoadingState t={t} />
        </>
      )}

      {!isLoading && !hasConfigs && (
        <>
          <PageHeader
            title={t('title')}
            subtitle={t('subtitle')}
            onBack={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
            onCartPress={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
          />
          {fetchError ? <FetchErrorState t={t} /> : <NoWifiState t={t} />}
        </>
      )}

      {!isLoading && hasConfigs && step === 'form' && (
        <GuestForm configs={configs} onSuccess={handleFormSuccess} onNavigate={onNavigate} t={t} />
      )}

      {!isLoading && hasConfigs && step === 'slider' && (
        <Slider configs={configs} onBack={handleBack} onNavigate={onNavigate} t={t} />
      )}
    </div>
  )
}

export default WifiScreen
