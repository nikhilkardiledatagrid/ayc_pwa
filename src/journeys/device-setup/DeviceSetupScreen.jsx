import { useState } from 'react'
import { motion } from 'framer-motion'
import { ScanLine, MapPin } from 'lucide-react'
import { useTranslation } from '../../i18n/index'
import TouchButton from '../../components/touch/TouchButton'
import { lookupDeviceByQr, confirmDeviceSetup } from './deviceSetupAPI'
import { saveDeviceConfig } from '../../core/utils/deviceConfig'
import { applyVenueTheme } from '../../core/utils/applyVenueTheme'

/**
 * DeviceSetupScreen — one-time device pairing shown on first PWA load.
 *
 * Step 1: Enter the QR code printed on the device → calls backend to fetch
 *         venue + available tables list.
 * Step 2: Select a table for this device → confirms with backend
 *         → saves device identity (device_token, device_id, qr_code)
 *         to localStorage and reloads.
 */
const DeviceSetupScreen = ({ onConfigured: _onConfigured }) => {
  const { t } = useTranslation('device-setup')

  const [qrCode,        setQrCode]        = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [deviceData,    setDeviceData]    = useState(null)
  const [selectedTable, setSelectedTable] = useState(null)
  const [saving,        setSaving]        = useState(false)

  const handleQrSubmit = async () => {
    const trimmed = qrCode.trim()
    if (!trimmed) { setError(t('errors.qr_required')); return }
    setError(null)
    setLoading(true)
    try {
      const data = await lookupDeviceByQr(trimmed)
      setDeviceData(data)
      if (data.theme) {
        applyVenueTheme(data.theme)
      }
      const currentTable = data.tables.find((tb) => tb.id === data.current_table_id) ?? null
      setSelectedTable(currentTable)
    } catch (err) {
      setError(['qr_not_found', 'network'].includes(err.message) ? t(`errors.${err.message}`) : (err.message || t('errors.generic')))
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => { setDeviceData(null); setSelectedTable(null); setError(null) }

  const handleConfirm = async () => {
    if (!selectedTable || saving) return
    setSaving(true)
    setError(null)
    try {
      await confirmDeviceSetup(qrCode.trim(), selectedTable.id)
    } catch (err) {
      setError(err.message || t('errors.generic'))
      setSaving(false)
      return
    }
    saveDeviceConfig({ device_token: deviceData.device_token, qr_code: qrCode.trim() })
    window.location.replace(window.location.pathname)
  }

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-background overflow-hidden px-6">
      {/* Background blobs */}
      <div className="absolute -top-10 -right-20 h-64 w-64 blob-mask bg-blush/60 -z-10 animate-blob" />
      <div className="absolute top-32 -left-24 h-52 w-52 blob-mask-2 bg-peach/50 -z-10 animate-blob" style={{ animationDelay: '4s' }} />

      {/* Brand header */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-float mb-4">
          <ScanLine className="h-8 w-8 text-white" />
        </div>
        <h1 className="font-display font-black text-2xl text-obsidian">{t('title')}</h1>
        <p className="mt-1 text-[13px] text-fg-muted">{t('subtitle')}</p>
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm bg-card rounded-3xl border border-border shadow-float p-6 flex flex-col gap-5"
      >
        {!deviceData ? (
          /* ── Step 1: QR code ── */
          <>
            <div>
              <h2 className="text-[16px] font-display font-black text-obsidian">{t('step1.heading')}</h2>
              <p className="mt-0.5 text-[12px] text-fg-muted">{t('step1.description')}</p>
            </div>

            <input
              type="text"
              value={qrCode}
              onChange={(e) => { setQrCode(e.target.value); setError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleQrSubmit()}
              placeholder={t('step1.placeholder')}
              autoCapitalize="characters"
              className={`w-full h-12 rounded-2xl bg-input-bg px-4 text-[14px] text-input-text placeholder:text-input-text/60 outline-none focus:ring-2 focus:ring-primary/30 border transition-colors ${error ? 'border-red-400' : 'border-border'}`}
            />
            {error && <p className="text-[12px] text-red-400 -mt-2">{error}</p>}

            <TouchButton
              onClick={handleQrSubmit}
              disabled={loading}
              className="w-full h-12 rounded-full bg-gradient-primary text-button-text font-bold shadow-float flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading
                ? <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />{t('step1.loading')}</>
                : t('step1.submit')
              }
            </TouchButton>
          </>
        ) : (
          /* ── Step 2: Table selection ── */
          <>
            <div>
              <h2 className="text-[16px] font-display font-black text-obsidian">{t('step2.heading')}</h2>
              <p className="mt-0.5 text-[12px] text-fg-muted">{t('step2.description')}</p>
            </div>

            {/* Venue + device info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-2xl bg-muted border border-border px-4 py-3">
                <MapPin className="h-4 w-4 text-fg-muted shrink-0" />
                <span className="text-[13px] text-fg-muted">{t('step2.venue_label')}:</span>
                <span className="text-[13px] font-bold text-obsidian truncate">{deviceData.venue_name}</span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-muted border border-border px-4 py-3">
                <ScanLine className="h-4 w-4 text-fg-muted shrink-0" />
                <span className="text-[13px] text-fg-muted">{t('step2.device_id_label')}:</span>
                <span className="text-[13px] font-bold text-obsidian truncate">{qrCode.trim()}</span>
              </div>
            </div>

            {/* Table grid */}
            <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto">
              {deviceData.tables.map((table) => (
                <TouchButton
                  key={table.id}
                  onClick={() => setSelectedTable(table)}
                  className={[
                    'relative rounded-2xl border py-3 text-[13px] font-bold transition-all active:scale-95',
                    selectedTable?.id === table.id
                      ? 'border-primary bg-primary text-button-text shadow-soft'
                      : 'border-border bg-muted text-fg',
                  ].join(' ')}
                >
                  {table.name}
                  {table.id === deviceData.current_table_id && (
                    <span className={`absolute top-1 right-1 text-[8px] font-black ${selectedTable?.id === table.id ? 'text-button-text/80' : 'text-primary'}`}>
                      {t('step2.current')}
                    </span>
                  )}
                </TouchButton>
              ))}
            </div>

            {error && <p className="text-[12px] text-red-400 -mt-2">{error}</p>}

            <div className="flex gap-3">
              <TouchButton
                onClick={handleBack}
                disabled={saving}
                className="flex-1 h-12 rounded-full border border-border bg-muted text-[14px] font-bold text-fg-muted"
              >
                {t('step2.back')}
              </TouchButton>
              <TouchButton
                onClick={handleConfirm}
                disabled={!selectedTable || saving}
                className="flex-[2] h-12 rounded-full bg-gradient-primary text-button-text text-[14px] font-bold shadow-float disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving
                  ? <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Saving…</>
                  : t('step2.confirm')
                }
              </TouchButton>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

export default DeviceSetupScreen
