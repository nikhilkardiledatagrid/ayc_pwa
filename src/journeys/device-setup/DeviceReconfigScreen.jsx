import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, LayoutGrid, X } from 'lucide-react'
import { useTranslation } from '../../i18n/index'
import TouchButton from '../../components/touch/TouchButton'
import { fetchVenueTables, verifyDevicePassword, updateDeviceTable } from './deviceReconfigAPI'

/**
 * DeviceReconfigScreen — "change table" overlay.
 * Opened by double-tapping the Menu screen's header title.
 *
 * Step 1: Operator enters the global device password.
 * Step 2: Operator picks a new table from the venue's active tables.
 */
const DeviceReconfigScreen = ({ onClose, onTableChanged }) => {
  const { t } = useTranslation('device-reconfig')

  const [password,      setPassword]      = useState('')
  const [verifying,     setVerifying]     = useState(false)
  const [passwordError, setPasswordError] = useState(null)
  const [verified,      setVerified]      = useState(false)

  const [tables,        setTables]        = useState([])
  const [tablesLoading, setTablesLoading] = useState(true)
  const [selectedTable, setSelectedTable] = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState(null)

  useEffect(() => {
    if (!verified) return
    fetchVenueTables()
      .then(setTables)
      .catch(() => setSaveError('errors.generic'))
      .finally(() => setTablesLoading(false))
  }, [verified])

  const handlePasswordSubmit = async () => {
    const trimmed = password.trim()
    if (!trimmed) { setPasswordError(t('errors.password_required')); return }
    setPasswordError(null)
    setVerifying(true)
    try {
      await verifyDevicePassword(trimmed)
      setVerified(true)
    } catch {
      setPasswordError(t('errors.password_invalid'))
    } finally {
      setVerifying(false)
    }
  }

  const handleConfirm = async () => {
    if (!selectedTable || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateDeviceTable(selectedTable.id)
      onTableChanged(selectedTable)
      onClose()
    } catch {
      setSaveError('errors.generic')
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-obsidian/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="w-full max-w-sm bg-card rounded-3xl border border-border shadow-float p-6 flex flex-col gap-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-2xl flex items-center justify-center ${verified ? 'bg-primary/10' : 'bg-obsidian/5'}`}>
                {verified
                  ? <LayoutGrid className="h-5 w-5 text-primary" />
                  : <Lock className="h-5 w-5 text-obsidian" />
                }
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-fg-muted font-bold">Operator</p>
                <h2 className="font-display font-black text-[17px] text-obsidian">
                  {verified ? t('table.heading') : t('password.heading')}
                </h2>
              </div>
            </div>
            <TouchButton onClick={onClose}
              className="h-9 w-9 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform">
              <X className="h-4 w-4 text-fg-muted" />
            </TouchButton>
          </div>

          {!verified ? (
            /* ── Step 1: password ── */
            <>
              <p className="text-[12px] text-fg-muted -mt-2">{t('password.description')}</p>

              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && !verifying && handlePasswordSubmit()}
                placeholder={t('password.placeholder')}
                autoFocus
                className={`w-full h-12 rounded-2xl bg-input-bg px-4 text-[14px] text-input-text placeholder:text-input-text/60 outline-none focus:ring-2 focus:ring-primary/30 border transition-colors ${passwordError ? 'border-red-400' : 'border-border'}`}
              />
              {passwordError && <p className="text-[12px] text-red-400 -mt-2">{passwordError}</p>}

              <div className="flex gap-3">
                <TouchButton onClick={onClose} disabled={verifying}
                  className="flex-1 h-12 rounded-full border border-border bg-muted text-[14px] font-bold text-fg-muted">
                  {t('password.cancel')}
                </TouchButton>
                <TouchButton onClick={handlePasswordSubmit} disabled={verifying}
                  className="flex-[2] h-12 rounded-full bg-gradient-primary text-button-text text-[14px] font-bold shadow-float disabled:opacity-60 flex items-center justify-center gap-2">
                  {verifying
                    ? <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />{t('password.loading')}</>
                    : t('password.submit')
                  }
                </TouchButton>
              </div>
            </>
          ) : (
            /* ── Step 2: table picker ── */
            <>
              <p className="text-[12px] text-fg-muted -mt-2">{t('table.description')}</p>

              {tablesLoading ? (
                <div className="flex justify-center py-6">
                  <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto">
                  {tables.map((table) => (
                    <TouchButton
                      key={table.id}
                      onClick={() => !table.is_current && setSelectedTable(table)}
                      disabled={table.is_current}
                      className={[
                        'relative rounded-2xl border py-3 text-[13px] font-bold transition-all active:scale-95',
                        table.is_current
                          ? 'border-border bg-muted text-fg-muted opacity-60'
                          : selectedTable?.id === table.id
                            ? 'border-primary bg-primary text-button-text shadow-soft'
                            : 'border-border bg-muted text-fg',
                      ].join(' ')}
                    >
                      {table.name}
                      {table.is_current && (
                        <span className={`absolute top-1 right-1 text-[8px] font-black ${selectedTable?.id === table.id ? 'text-button-text/80' : 'text-primary'}`}>
                          {t('table.current')}
                        </span>
                      )}
                    </TouchButton>
                  ))}
                </div>
              )}

              {saveError && <p className="text-[12px] text-red-400 -mt-2">{t(saveError)}</p>}

              <div className="flex gap-3">
                <TouchButton onClick={onClose} disabled={saving}
                  className="flex-1 h-12 rounded-full border border-border bg-muted text-[14px] font-bold text-fg-muted">
                  {t('table.back')}
                </TouchButton>
                <TouchButton onClick={handleConfirm} disabled={!selectedTable || saving}
                  className="flex-[2] h-12 rounded-full bg-gradient-primary text-button-text text-[14px] font-bold shadow-float disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving
                    ? <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Saving…</>
                    : t('table.confirm')
                  }
                </TouchButton>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default DeviceReconfigScreen
