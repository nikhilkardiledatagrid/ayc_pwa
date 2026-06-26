import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { motion } from 'framer-motion'
import { ImageOff } from 'lucide-react'
import { useTranslation } from '../../i18n/index'
import { logEvent } from '../../core/utils/eventQueue'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectReturnUrl, selectVenueConfig } from '../../core/store/venueConfigSlice'
import { selectSessionId } from '../../core/store/sessionSlice'
import { EVENT_TYPES } from '../../constants/events'
import { JOURNEYS } from '../../constants/journeys'
import PageHeader from '../../components/layout/PageHeader'

const StaticMenuScreen = ({ onNavigate }) => {
  const { t }       = useTranslation('menu')
  const returnUrl   = useSelector(selectReturnUrl)
  const sessionId   = useSelector(selectSessionId)
  const venueConfig = useSelector(selectVenueConfig)
  const [imgFailed, setImgFailed] = useState(false)

  const menuImageUrl = venueConfig?.menu_image_url ?? venueConfig?.branding?.menu_image_url ?? null

  useEffect(() => {
    startTimeout('session_idle_ms', () => {
      logEvent({ event_type: EVENT_TYPES.JOURNEY_TIMEOUT, journey: JOURNEYS.STATIC_MENU, session_id: sessionId })
      returnToIdle({ return_url: returnUrl }, sessionId)
    })
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  useEffect(() => {
    if (!sessionId) return
    logEvent({ event_type: EVENT_TYPES.PAGE_VIEW, page: JOURNEYS.STATIC_MENU, session_id: sessionId })
  }, [sessionId])

  return (
    <div className="flex flex-1 flex-col bg-background overflow-hidden">
      <PageHeader
        title={t('title')}
        onBack={onNavigate ? () => onNavigate(JOURNEYS.MENU) : undefined}
        showCart
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 px-4 pb-4"
      >
        {menuImageUrl && !imgFailed ? (
          <img
            src={menuImageUrl}
            alt={t('title')}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain rounded-3xl"
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted border border-border">
              <ImageOff className="h-9 w-9 text-fg-muted" />
            </div>
            <p className="font-display text-[18px] font-bold text-fg">{t('empty.title')}</p>
            <p className="text-[13px] text-fg-muted text-center max-w-[240px]">{t('empty.message')}</p>
          </div>
        )}
      </motion.div>
    </div>
  )
}

export default StaticMenuScreen
