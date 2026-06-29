import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Image, Database, X } from 'lucide-react'
import TouchButton from '../../components/touch/TouchButton'
import { clearReferenceCache } from '../../core/db/aycDb'
import { MENU_IMAGES_CACHE_NAME } from '../../core/constants/cacheNames'

/**
 * CacheDebugScreen — dev-only overlay for clearing on-device caches without
 * Settings/DevTools access (e.g. a fully locked-down OptiSigns kiosk).
 * Opened by double-tapping the Menu screen's venue logo. No password gate,
 * by design — faster iteration while testing, at the cost of a guest being
 * able to trigger it by accident on a live kiosk.
 */
const CacheDebugScreen = ({ onClose }) => {
    const [clearing, setClearing] = useState(null) // 'images' | 'data' | null

    const handleClearImages = async () => {
        setClearing('images')
        await caches.delete(MENU_IMAGES_CACHE_NAME)
        // window.location.reload()
    }

    const handleClearData = async () => {
        setClearing('data')
        await clearReferenceCache()
        // window.location.reload()
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
                            <div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-obsidian/5">
                                <Database className="h-5 w-5 text-obsidian" />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-fg-muted font-bold">Debug</p>
                                <h2 className="font-display font-black text-[17px] text-obsidian">Cache Tools</h2>
                            </div>
                        </div>
                        <TouchButton onClick={onClose}
                            className="h-9 w-9 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform">
                            <X className="h-4 w-4 text-fg-muted" />
                        </TouchButton>
                    </div>

                    <p className="text-[12px] text-fg-muted -mt-2">
                        Clears on-device cache and reloads the app. Use only for testing.
                    </p>

                    <div className="flex flex-col gap-3">
                        <TouchButton onClick={handleClearImages} disabled={!!clearing}
                            className="h-12 rounded-full bg-gradient-primary text-button-text text-[14px] font-bold shadow-float disabled:opacity-60 flex items-center justify-center gap-2">
                            {clearing === 'images'
                                ? <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Clearing…</>
                                : <><Image className="h-4 w-4" />Clear Images Cache</>
                            }
                        </TouchButton>

                        <TouchButton onClick={handleClearData} disabled={!!clearing}
                            className="h-12 rounded-full border border-border bg-muted text-[14px] font-bold text-fg disabled:opacity-60 flex items-center justify-center gap-2">
                            {clearing === 'data'
                                ? <><div className="h-4 w-4 rounded-full border-2 border-obsidian/40 border-t-transparent animate-spin" />Clearing…</>
                                : <><Database className="h-4 w-4" />Clear Data Cache</>
                            }
                        </TouchButton>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}

export default CacheDebugScreen
