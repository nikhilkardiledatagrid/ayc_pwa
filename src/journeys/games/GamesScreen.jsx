import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { motion, AnimatePresence } from 'framer-motion'
import { Gift, HelpCircle, Sparkles, ArrowRight } from 'lucide-react'
import { useTranslation } from '../../i18n/index'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectReturnUrl } from '../../core/store/venueConfigSlice'
import { selectSessionId } from '../../core/store/sessionSlice'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import TouchButton from '../../components/touch/TouchButton'
import PageHeader from '../../components/layout/PageHeader'

const VIEW = { LANDING: 'landing', SPIN: 'spin', QUIZ: 'quiz', SCRATCH: 'scratch' }

// ── Scratch Card ──────────────────────────────────────────────────────────────
const ScratchGame = ({ t, onBack }) => {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={t('scratch.title')} onBack={onBack} showCart={false} />
      <div className="px-5 mt-4 text-center">
        <div className="relative mx-auto w-full max-w-sm aspect-[4/3] rounded-3xl overflow-hidden shadow-float">
          {/* Reward behind the scratch layer */}
          <div className="absolute inset-0 bg-gradient-primary flex flex-col items-center justify-center text-white">
            <p className="text-xs uppercase tracking-widest opacity-90">{t('scratch.your_reward')}</p>
            <p className="mt-2 text-5xl font-black font-display">20% OFF</p>
            <p className="mt-3 text-sm opacity-90">{t('scratch.next_visit')}</p>
          </div>
          {/* Scratch overlay */}
          <AnimatePresence>
            {!revealed && (
              <motion.div exit={{ scale: 1.4, opacity: 0 }} transition={{ duration: 0.35 }}>
                <TouchButton
                  onClick={() => setRevealed(true)}
                  className="absolute inset-0 bg-gradient-to-br from-fg-muted/80 to-obsidian/70 flex flex-col items-center justify-center text-white"
                >
                  <Gift className="h-14 w-14" />
                  <p className="mt-3 font-bold text-lg">{t('scratch.tap_to_scratch')}</p>
                  <p className="text-xs opacity-90 mt-1">{t('scratch.reveal_hint')}</p>
                </TouchButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {revealed && (
          <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-6">
            <TouchButton
              onClick={onBack}
              className="w-full h-14 rounded-full bg-card border border-border font-bold text-fg shadow-card"
            >
              {t('scratch.reveal_button')}
            </TouchButton>
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ── Quiz Game ─────────────────────────────────────────────────────────────────
const QUESTIONS = [
  { q: "Which dish is on our Chef's Specials?",  opts: ['Truffle Risotto', 'Tacos', 'Pad Thai', 'Sushi'],     a: 0 },
  { q: 'What time does dinner service start?',   opts: ['4 PM', '5 PM', '6 PM', '7 PM'],                    a: 2 },
  { q: 'Which dessert features pistachio?',      opts: ['Cheesecake', 'Tiramisu', 'Brownie', 'Pavlova'],     a: 1 },
]

const QuizGame = ({ t, onBack }) => {
  const [idx,    setIdx]    = useState(0)
  const [score,  setScore]  = useState(0)
  const [done,   setDone]   = useState(false)
  const [picked, setPicked] = useState(null)

  const answer = (n) => {
    if (picked !== null) return
    setPicked(n)
    setTimeout(() => {
      const next = n === QUESTIONS[idx].a ? score + 1 : score
      if (idx + 1 >= QUESTIONS.length) { setScore(next); setDone(true) }
      else { setScore(next); setIdx((i) => i + 1); setPicked(null) }
    }, 700)
  }

  const resultMsg = score === QUESTIONS.length ? t('quiz.perfect') : score >= 2 ? t('quiz.good') : t('quiz.thanks')

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title={t('quiz.title')}
        subtitle={done ? t('quiz.results') : t('quiz.question_counter', { current: idx + 1, total: QUESTIONS.length })}
        onBack={onBack}
        showCart={false}
      />
      <div className="px-5">
        {done ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gradient-hero rounded-3xl p-6 text-center border border-primary/10 shadow-card"
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">{t('quiz.your_score')}</p>
            <p className="mt-2 text-5xl font-black text-primary">{score}/{QUESTIONS.length}</p>
            <p className="mt-4 text-sm text-muted-foreground">{resultMsg}</p>
            <TouchButton
              onClick={onBack}
              className="mt-6 w-full h-12 rounded-full bg-card border border-border font-semibold text-fg shadow-card"
            >
              {t('quiz.thanks')}
            </TouchButton>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
            >
              <div className="bg-card rounded-3xl p-6 border border-border shadow-card">
                <h2 className="text-xl font-bold leading-snug text-obsidian">{QUESTIONS[idx].q}</h2>
                <div className="mt-5 space-y-2">
                  {QUESTIONS[idx].opts.map((opt, n) => (
                    <TouchButton
                      key={n}
                      onClick={() => answer(n)}
                      disabled={picked !== null}
                      className={`w-full h-14 rounded-2xl text-left px-4 font-semibold border transition-colors ${
                        picked === n
                          ? n === QUESTIONS[idx].a
                            ? 'bg-success/15 border-success text-success'
                            : 'bg-destructive/10 border-destructive text-destructive'
                          : 'bg-card border-border text-fg active:bg-primary/5'
                      }`}
                    >
                      {opt}
                    </TouchButton>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

// ── Spin Wheel ────────────────────────────────────────────────────────────────
const REWARDS = ['10% Off', 'Free Drink', 'Free Dessert', '5% Off', 'Mystery Gift', 'Free Side', '15% Off', 'Try Again']
const COLORS  = ['#E73E32', '#C46A3A', '#E73E32', '#C46A3A', '#E73E32', '#C46A3A', '#E73E32', '#C46A3A']

const SpinGame = ({ t, onBack }) => {
  const [rotation, setRotation] = useState(0)
  const [result,   setResult]   = useState(null)
  const [spinning, setSpinning] = useState(false)

  const spin = () => {
    if (spinning) return
    setResult(null)
    setSpinning(true)
    const idx    = Math.floor(Math.random() * REWARDS.length)
    const target = 360 * 6 + (360 - idx * 45 - 22.5)
    setRotation((r) => r + target)
    setTimeout(() => { setResult(REWARDS[idx]); setSpinning(false) }, 4200)
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={t('spin.title')} onBack={onBack} showCart={false} />
      <div className="px-5 mt-2 text-center">
        <div className="relative mx-auto w-[300px] h-[300px]">
          {/* Pointer */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[14px] border-r-[14px] border-t-[24px] border-l-transparent border-r-transparent border-t-primary z-10" />
          <motion.svg
            viewBox="0 0 200 200"
            animate={{ rotate: rotation }}
            transition={{ duration: 4, ease: [0.17, 0.67, 0.3, 0.99] }}
            className="w-full h-full drop-shadow-2xl"
          >
            {REWARDS.map((r, i) => {
              const a1 = (i * 45 - 90) * (Math.PI / 180)
              const a2 = ((i + 1) * 45 - 90) * (Math.PI / 180)
              const x1 = 100 + 95 * Math.cos(a1), y1 = 100 + 95 * Math.sin(a1)
              const x2 = 100 + 95 * Math.cos(a2), y2 = 100 + 95 * Math.sin(a2)
              const tx = 100 + 60 * Math.cos((a1 + a2) / 2)
              const ty = 100 + 60 * Math.sin((a1 + a2) / 2)
              return (
                <g key={i}>
                  <path d={`M100 100 L${x1} ${y1} A95 95 0 0 1 ${x2} ${y2} Z`} fill={COLORS[i]} stroke="#fff" strokeWidth="1.5" />
                  <text x={tx} y={ty} fill="#fff" fontSize="8" fontWeight="700" textAnchor="middle"
                    transform={`rotate(${i * 45 + 22.5}, ${tx}, ${ty})`}>
                    {r}
                  </text>
                </g>
              )
            })}
            <circle cx="100" cy="100" r="14" fill="#fff" />
          </motion.svg>
        </div>

        {result ? (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16 }}
            className="mt-8 bg-gradient-primary text-white rounded-3xl p-5 shadow-float"
          >
            <p className="text-xs uppercase tracking-widest opacity-90">{t('spin.you_won')}</p>
            <p className="mt-1 text-3xl font-black font-display">{result}</p>
            <p className="mt-2 text-sm opacity-90">{t('spin.redeem')}</p>
          </motion.div>
        ) : (
          <TouchButton
            onClick={spin}
            disabled={spinning}
            className="mt-8 w-full h-14 rounded-full bg-gradient-primary text-white font-bold shadow-float disabled:opacity-60"
          >
            {spinning ? t('spin.spinning') : t('spin.spin_now')}
          </TouchButton>
        )}
      </div>
    </div>
  )
}

// ── Landing ───────────────────────────────────────────────────────────────────
const GAME_CARDS = [
  { view: VIEW.SPIN,    Icon: Sparkles,   bg: 'bg-gradient-peach', tKey: 'spin'    },
  { view: VIEW.QUIZ,    Icon: HelpCircle, bg: 'bg-blush',          tKey: 'quiz'    },
  { view: VIEW.SCRATCH, Icon: Gift,       bg: 'bg-gradient-cream', tKey: 'scratch' },
]

const GamesLanding = ({ t, onNavigate, onSelect }) => (
  <div className="relative pb-6 flex flex-col flex-1">
    <PageHeader
      title={t('title')}
      subtitle={t('subtitle')}
      onBack={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
      showCart={false}
    />

    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="px-5">
      <div className="relative overflow-hidden rounded-[2rem] bg-obsidian text-white p-6 shadow-card">
        <div className="absolute -right-10 -top-10 h-40 w-40 blob-mask bg-primary/40 blur-2xl" />
        <div className="absolute -left-8 -bottom-10 h-32 w-32 blob-mask-2 bg-secondary/40 blur-2xl" />
        <span className="relative text-[10px] tracking-[0.2em] font-bold px-2.5 py-1 rounded-full bg-primary">
          {t('hero_badge')}
        </span>
        <h2 className="relative mt-3 text-3xl font-display italic font-black leading-none">{t('hero_heading')}</h2>
        <p className="relative mt-2 text-sm text-white/70">{t('hero_body')}</p>
      </div>
    </motion.div>

    <div className="px-5 mt-5 space-y-3">
      {GAME_CARDS.map((g, i) => (
        <motion.div
          key={g.view}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          whileTap={{ scale: 0.97 }}
        >
          <TouchButton
            onClick={() => onSelect(g.view)}
            className={`relative overflow-hidden w-full ${g.bg} rounded-[1.4rem] p-4 border border-border shadow-card flex items-center gap-4 text-left`}
          >
            <div className="h-12 w-12 rounded-2xl bg-obsidian flex items-center justify-center text-white shadow-soft shrink-0">
              <g.Icon className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display italic font-black text-lg text-obsidian leading-tight">{t(`${g.tKey}.title`)}</p>
              <p className="text-xs text-foreground/70 mt-0.5 line-clamp-1">{t(`${g.tKey}.body`)}</p>
              <span className="inline-block mt-1.5 text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full bg-primary text-white">
                {t(`${g.tKey}.reward`).toUpperCase()}
              </span>
            </div>
            <div className="h-9 w-9 rounded-full bg-white/70 border border-primary/15 flex items-center justify-center shrink-0">
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
          </TouchButton>
        </motion.div>
      ))}
    </div>
  </div>
)

// ── GamesScreen (root) ────────────────────────────────────────────────────────
const GamesScreen = ({ onNavigate }) => {
  const { t }     = useTranslation('games')
  const returnUrl = useSelector(selectReturnUrl)
  const sessionId = useSelector(selectSessionId)
  const [view, setView] = useState(VIEW.LANDING)

  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: JOURNEYS.GAME, session_id: sessionId })
      returnToIdle({ return_url: returnUrl }, sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  useEffect(() => {
    if (!sessionId) return
    logEvent({ event_type: EVENT_TYPES.PAGE_VIEW,     page: JOURNEYS.GAME,    session_id: sessionId })
    logEvent({ event_type: EVENT_TYPES.JOURNEY_START, journey: JOURNEYS.GAME, session_id: sessionId })
  }, [sessionId])

  if (view === VIEW.SPIN)    return <SpinGame    t={t} onBack={() => setView(VIEW.LANDING)} />
  if (view === VIEW.QUIZ)    return <QuizGame    t={t} onBack={() => setView(VIEW.LANDING)} />
  if (view === VIEW.SCRATCH) return <ScratchGame t={t} onBack={() => setView(VIEW.LANDING)} />

  return <GamesLanding t={t} onNavigate={onNavigate} onSelect={setView} />
}

export default GamesScreen
