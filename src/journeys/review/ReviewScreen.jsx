import { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Star, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from '../../i18n/index'
import { queuedPost } from '../../core/api/pwaApiService'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { restartSession } from '../../core/utils/sessionManager'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectReturnUrl, selectJourneyConfig, selectSessionTtlMs } from '../../core/store/venueConfigSlice'
import { selectSession, setSession } from '../../core/store/sessionSlice'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import { useGuestProfile } from '../../core/utils/guestProfile'
import TouchButton from '../../components/touch/TouchButton'
import PageHeader from '../../components/layout/PageHeader'
import NotConfiguredState from '../../components/feedback/NotConfiguredState'

/**
 * Review journey state machine:
 *
 *   RATING     → guest taps a star (1-5)
 *                ≥ 4 → SUBMITTING → QR_DISPLAY (stays until idle timeout or guest navigates away)
 *                ≤ 3 → FEEDBACK (category chips + textarea)
 *   FEEDBACK   → SUBMITTING → THANK_YOU (stays until idle timeout or guest navigates away)
 *   SUBMITTING → spinner
 *   ERROR      → shows error, tapping any star restarts
 */

const STATE = {
  RATING:     'rating',
  FEEDBACK:   'feedback',
  SUBMITTING: 'submitting',
  QR_DISPLAY: 'qr_display',
  THANK_YOU:  'thank_you',
  ERROR:      'error',
}

const ISSUE_CHIPS = ['Food quality', 'Service', 'Wait time', 'Cleanliness', 'Order accuracy', 'Other']

const ReviewScreen = ({ onNavigate }) => {
  const { t }                   = useTranslation('review')
  const dispatch                = useDispatch()
  const returnUrl               = useSelector(selectReturnUrl)
  const journeyConfig           = useSelector(selectJourneyConfig)
  const sessionTtlMs            = useSelector(selectSessionTtlMs)
  const { sessionId, screenId, table, scenario } = useSelector(selectSession)

  // Treat as configured until config loads (null) — only block once we know the
  // venue has no Google review link set.
  const reviewConfigured = journeyConfig ? !!journeyConfig.review : true

  const { profile, save: saveGuestProfile, clear: clearGuestProfile } = useGuestProfile()
  const nameLocked = !!(profile?.first_name && profile?.last_name)

  const [state,       setState]       = useState(STATE.RATING)
  const [rating,      setRating]      = useState(0)
  const [hover,       setHover]       = useState(0)
  const [selected,    setSelected]    = useState([])   // issue chips
  // Draft state — while nameLocked, the inputs display (and submit) the
  // saved profile instead, derived below rather than synced via an effect.
  const [firstNameDraft, setFirstNameDraft] = useState('')
  const [lastNameDraft,  setLastNameDraft]  = useState('')
  const [feedback,    setFeedback]    = useState('')
  const [redirectUrl, setRedirectUrl] = useState(null)
  const [errorMsg,    setErrorMsg]    = useState(null)

  const firstName = nameLocked ? profile.first_name : firstNameDraft
  const lastName  = nameLocked ? profile.last_name  : lastNameDraft
  const setFirstName = setFirstNameDraft
  const setLastName  = setLastNameDraft

  const resetNameFields = () => {
    setFirstNameDraft('')
    setLastNameDraft('')
  }

  const handleClearSavedInfo = async () => {
    clearGuestProfile()
    resetNameFields()
    // Whoever clears a wrongly-resumed profile isn't the guest the current
    // session belongs to either — rotate the session id along with it.
    const newSessionId = await restartSession(sessionId, { table, scenario, sessionTtlMs })
    dispatch(setSession({ sessionId: newSessionId }))
  }

  // ── Idle timeout ──────────────────────────────────────────────────────────
  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: JOURNEYS.REVIEW, session_id: sessionId })
      returnToIdle({ return_url: returnUrl }, sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  // ── Log page view ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    logEvent({ event_type: EVENT_TYPES.PAGE_VIEW, page: JOURNEYS.REVIEW, session_id: sessionId })
    logEvent({ event_type: EVENT_TYPES.JOURNEY_START, journey: JOURNEYS.REVIEW, session_id: sessionId })
  }, [sessionId])

  // ── Step dwell ─────────────────────────────────────────────────────────────
  // state === RATING dwell is the headline metric here: time the guest spends
  // looking at the stars before tapping one (completion) or timing out (abandonment).
  const stepDwellStartRef = useRef(null)
  useEffect(() => {
    stepDwellStartRef.current = Date.now()
    const currentStep = state
    return () => {
      if (sessionId) {
        logEvent({
          event_type: EVENT_TYPES.STEP_DWELL,
          journey: JOURNEYS.REVIEW,
          step: currentStep,
          dwell_ms: Date.now() - stepDwellStartRef.current,
          session_id: sessionId,
        })
      }
    }
  }, [state, sessionId])

  // ── Submit to backend ─────────────────────────────────────────────────────
  const submit = async (selectedRating, name, feedbackText, identity) => {
    setState(STATE.SUBMITTING)
    setErrorMsg(null)

    try {
      if (selectedRating >= 4) {
        const res = await queuedPost('/pwa/capture/review-intent', {
          rating:     selectedRating,
          session_id: sessionId,
          screen_id:  screenId,
        })
        // res.queued === true means we're offline — there's no backend-generated
        // Google review redirect_url yet, so a QR code can't be shown. Degrade to
        // the thank-you state instead of rendering a QR with nothing to point to.
        const redirectUrl = res.queued ? null : (res.data?.data?.redirect_url ?? null)
        setRedirectUrl(redirectUrl)
        setState(redirectUrl ? STATE.QR_DISPLAY : STATE.THANK_YOU)
        if (sessionId) await logEvent({ event_type: EVENT_TYPES.JOURNEY_COMPLETE, journey: JOURNEYS.REVIEW, rating: selectedRating, session_id: sessionId })
      } else {
        // Combine chips + textarea into reason
        const chipText = selected.length ? selected.join(', ') : ''
        const reason   = [chipText, feedbackText].filter(Boolean).join(' — ') || undefined
        await queuedPost('/pwa/review-feedback', {
          rating:        selectedRating,
          full_name:     name || undefined,
          reason,
          session_id:    sessionId,
          screen_id:     screenId,
        })
        if (identity?.first_name && identity?.last_name) saveGuestProfile(identity)
        setState(STATE.THANK_YOU)
        if (sessionId) {
          await logEvent({
            event_type: EVENT_TYPES.JOURNEY_COMPLETE,
            journey:    JOURNEYS.REVIEW,
            rating:     selectedRating,
            full_name:  name || undefined,
            reason,
            session_id: sessionId,
          })
        }
      }
    } catch (err) {
      setErrorMsg(err?.response?.data?.message ?? t('error.generic'))
      setState(STATE.ERROR)
    }
  }

  // ── Star tap ──────────────────────────────────────────────────────────────
  const handleStarTap = async (star) => {
    setRating(star)
    setSelected([])
    resetNameFields()
    setFeedback('')
    setErrorMsg(null)
    setHover(0)
    if (sessionId) await logEvent({ event_type: EVENT_TYPES.REVIEW_TAPPED, rating: star, session_id: sessionId })
    if (star >= 4) {
      await submit(star, null, null)
    } else {
      setState(STATE.FEEDBACK)
    }
  }

  const toggleChip = (chip) =>
    setSelected((prev) => prev.includes(chip) ? prev.filter((x) => x !== chip) : [...prev, chip])

  const handleFeedbackSubmit = () => submit(
    rating,
    `${firstName.trim()} ${lastName.trim()}`.trim(),
    feedback,
    { first_name: firstName.trim(), last_name: lastName.trim() },
  )

  const activeStars = hover || rating

  // ── Not configured: no Google review link set for this venue ───────────────
  if (!reviewConfigured) {
    return (
      <div className="relative flex flex-1 flex-col bg-background">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          onBack={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
          onCartPress={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
        />
        <NotConfiguredState title={t('not_configured.title')} message={t('not_configured.message')} />
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col bg-background">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        onBack={
          state === STATE.FEEDBACK
            ? () => { setState(STATE.RATING); setRating(0); setSelected([]); resetNameFields(); setFeedback('') }
            : (onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined)
        }
        onCartPress={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
      />

      <div className="px-5 mt-2">
        <AnimatePresence mode="wait">

          {/* ── RATING / ERROR ── */}
          {(state === STATE.RATING || state === STATE.ERROR) && (
            <motion.div
              key="rating"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full bg-primary/10 rounded-3xl p-8 border border-primary/10 shadow-card text-center"
            >
              <p className="text-sm text-muted-foreground">{t('rating.heading')}</p>
              <div className="mt-6 flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <motion.button
                    key={n}
                    whileTap={{ scale: 0.85 }}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => handleStarTap(n)}
                    className="p-2"
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`h-12 w-12 transition-all duration-150 ${
                        activeStars >= n ? 'fill-primary text-primary' : 'text-muted-foreground/40'
                      }`}
                    />
                  </motion.button>
                ))}
              </div>
              <p className="mt-6 text-sm font-semibold text-muted-foreground">{t('rating.subheading')}</p>
              {state === STATE.ERROR && errorMsg && (
                <p className="mt-3 text-sm text-destructive" role="alert">{errorMsg}</p>
              )}
            </motion.div>
          )}

          {/* ── FEEDBACK (≤3 stars) ── */}
          {state === STATE.FEEDBACK && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full space-y-4"
            >
              {/* Heading card with re-tappable stars */}
              <div className="bg-primary/10 rounded-3xl border border-primary/10 shadow-card p-6 text-center">
                <p className="font-display font-black italic text-xl text-obsidian">{t('feedback.heading')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('feedback.subheading')}</p>
                <div className="mt-4 flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <motion.button
                      key={n}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => handleStarTap(n)}
                      className="p-1.5"
                      aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    >
                      <Star
                        className={`h-8 w-8 transition-all duration-150 ${
                          rating >= n ? 'fill-primary text-primary' : 'text-muted-foreground/30'
                        }`}
                      />
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Issue chips */}
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                  {t('feedback.what_went_wrong')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ISSUE_CHIPS.map((chip) => (
                    <TouchButton
                      key={chip}
                      onClick={() => toggleChip(chip)}
                      className={`px-4 py-2.5 rounded-full text-sm font-semibold border transition-colors ${
                        selected.includes(chip)
                          ? 'bg-primary text-white border-primary'
                          : 'bg-card border-border text-fg'
                      }`}
                    >
                      {chip}
                    </TouchButton>
                  ))}
                </div>
              </div>

              {/* Name + comment */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={firstName}
                  disabled={nameLocked}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={127}
                  placeholder={t('feedback.first_name_placeholder')}
                  className="flex-1 min-w-0 h-12 rounded-2xl bg-[#EFEFEF] border border-border px-4 text-sm text-input-text placeholder:text-[#888] focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                />
                <input
                  type="text"
                  value={lastName}
                  disabled={nameLocked}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={127}
                  placeholder={t('feedback.last_name_placeholder')}
                  className="flex-1 min-w-0 h-12 rounded-2xl bg-[#EFEFEF] border border-border px-4 text-sm text-input-text placeholder:text-[#888] focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                />
              </div>
              {nameLocked && (
                <TouchButton
                  onClick={handleClearSavedInfo}
                  className="inline-flex items-center justify-start px-1 -mt-2 text-[12px] font-semibold text-primary underline underline-offset-2"
                >
                  {t('feedback.clear_saved_info')}
                </TouchButton>
              )}
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t('feedback.textarea_placeholder')}
                className="w-full h-32 rounded-2xl bg-[#EFEFEF] border border-border p-4 text-sm text-input-text placeholder:text-[#888] resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />

              <motion.div whileTap={{ scale: 0.97 }}>
                <TouchButton
                  onClick={handleFeedbackSubmit}
                  className="w-full h-14 rounded-full bg-gradient-primary text-button-text font-bold shadow-float"
                >
                  {t('feedback.submit')}
                </TouchButton>
              </motion.div>
              <TouchButton
                onClick={() => { setState(STATE.RATING); setRating(0); setSelected([]); resetNameFields(); setFeedback('') }}
                className="w-full text-center text-sm text-muted-foreground underline"
              >
                {t('feedback.skip')}
              </TouchButton>
            </motion.div>
          )}

          {/* ── SUBMITTING ── */}
          {state === STATE.SUBMITTING && (
            <motion.div key="submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-muted-foreground">{t('submitting')}</p>
            </motion.div>
          )}

          {/* ── QR DISPLAY (≥4 stars) — "Glad you enjoyed it" ── */}
          {state === STATE.QR_DISPLAY && redirectUrl && (
            <motion.div
              key="qr"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="w-full bg-primary/10 rounded-3xl p-6 border border-primary/10 shadow-card text-center"
            >
              <p className="font-display font-black italic text-xl text-obsidian">{t('qr_display.heading')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('qr_display.subheading')}</p>
              <div className="mt-5 mx-auto bg-card rounded-3xl p-4 inline-block shadow-card" aria-label="Google review QR code">
                <QRCodeSVG value={redirectUrl} size={200} />
              </div>
              <p className="mt-5 text-xs text-muted-foreground">{t('qr_display.return_notice')}</p>
              {onNavigate && (
                <motion.div whileTap={{ scale: 0.97 }} className="mt-4">
                  <TouchButton
                    onClick={() => onNavigate(JOURNEYS.MENU)}
                    className="w-full h-14 rounded-full bg-card border border-border font-bold text-fg shadow-card"
                  >
                    {t('qr_display.back_to_menu')}
                  </TouchButton>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── THANK YOU (≤3 stars, after feedback submit) ── */}
          {state === STATE.THANK_YOU && (
            <motion.div
              key="thanks"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full bg-primary/10 rounded-3xl p-8 border border-primary/10 shadow-card text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 14 }}
                className="mx-auto h-16 w-16 rounded-full bg-success flex items-center justify-center shadow-soft"
              >
                <Check className="h-8 w-8 text-white" strokeWidth={2.5} />
              </motion.div>
              <p className="mt-5 font-display font-black italic text-xl text-obsidian">{t('thank_you.heading')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t('thank_you.subheading')}</p>
              <TouchButton
                onClick={() => { setState(STATE.RATING); setRating(0); setSelected([]) }}
                className="mt-6 w-full h-12 rounded-full bg-card border border-border font-semibold text-fg shadow-card"
              >
                {t('rate_again')}
              </TouchButton>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

export default ReviewScreen
