import { useSelector } from 'react-redux'
import { useEffect } from 'react'
import { returnToIdle } from '../../core/utils/returnToIdle'
import { startTimeout, stopTimeout } from '../../core/utils/timeoutManager'
import { selectReturnUrl } from '../../core/store/venueConfigSlice'
import { selectSessionId } from '../../core/store/sessionSlice'
import { getDeviceConfig } from '../../core/utils/deviceConfig'
import TouchButton from '../../components/touch/TouchButton'

/**
 * DashboardScreen — venue operator overview for this device.
 *
 * Shows device pairing info (venue, table) and a back button.
 * Full dashboard content to be defined in a future sprint.
 *
 * @param {{ onBack: () => void }} props
 */
const DashboardScreen = ({ onBack }) => {
  const returnUrl   = useSelector(selectReturnUrl)
  const sessionId   = useSelector(selectSessionId)
  const deviceConfig = getDeviceConfig()

  useEffect(() => {
    startTimeout('session_idle_ms', () => returnToIdle({ return_url: returnUrl }, sessionId))
    return () => stopTimeout('session_idle_ms')
  }, [returnUrl, sessionId])

  return (
    <div className="flex h-screen w-screen flex-col bg-[#181818]">

      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-3 sm:px-8 sm:py-4">
        <span className="font-display text-[14px] sm:text-[16px] font-bold text-fg tracking-tight">
          Dashboard
        </span>
        <TouchButton
          onClick={onBack}
          className="rounded-full border border-[var(--border)] px-4 py-1.5 text-[12px] font-medium text-fg-muted"
        >
          Back
        </TouchButton>
      </header>

      {/* Device info card */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-elevated p-5 flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-fg">Device Info</h2>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-[12px] text-fg-muted">Venue</span>
              <span className="text-[12px] font-medium text-fg">
                {deviceConfig?.venue_id ? `#${deviceConfig.venue_id}` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[12px] text-fg-muted">Table</span>
              <span className="text-[12px] font-medium text-fg">
                {deviceConfig?.table_name ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[12px] text-fg-muted">Configured</span>
              <span className="text-[12px] font-medium text-fg">
                {deviceConfig?.configured_at
                  ? new Date(deviceConfig.configured_at).toLocaleDateString()
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        <p className="text-[12px] text-fg-muted">Full dashboard coming in a future sprint.</p>
      </div>

    </div>
  )
}

export default DashboardScreen
