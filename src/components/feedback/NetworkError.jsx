/**
 * NetworkError — full-screen or inline API failure screen (task 7.20).
 *
 * Props:
 *   title?    Override heading (falls back to generic copy)
 *   message?  Override body text
 *   onRetry?  When provided, shows a retry button and calls this on tap
 *   compact?  Render as an inline block instead of full-screen
 *   offline?  Show "you appear to be offline" copy instead of generic API error
 *
 * All journeys should render this when a critical API call fails, so guests
 * never see a blank or broken screen.
 */

import { motion } from 'framer-motion'
import TouchButton from '../touch/TouchButton'

const WifiOffIcon = () => (
  <svg
    width="36" height="36"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <circle cx="12" cy="20" r="1" fill="currentColor" />
  </svg>
)

const AlertIcon = () => (
  <svg
    width="36" height="36"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const NetworkError = ({
  title,
  message,
  onRetry,
  compact = false,
  offline = false,
}) => {
  const defaultTitle   = offline ? 'You\'re offline' : 'Something went wrong'
  const defaultMessage = offline
    ? 'Check your connection and try again.'
    : 'We couldn\'t reach the server. Please try again.'

  const Icon = offline ? WifiOffIcon : AlertIcon

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className={`flex flex-col items-center gap-4 text-center ${compact ? 'py-10 px-6' : 'px-8'}`}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted border border-border text-fg-muted">
        <Icon />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display font-black text-[1.25rem] text-fg">
          {title ?? defaultTitle}
        </h2>
        <p className="text-[13px] text-fg-muted max-w-[28ch] mx-auto leading-relaxed">
          {message ?? defaultMessage}
        </p>
      </div>

      {onRetry && (
        <TouchButton
          onClick={onRetry}
          className="mt-1 h-12 px-8 rounded-full bg-primary text-white font-bold text-sm shadow-soft active:bg-primary/85"
        >
          Try again
        </TouchButton>
      )}
    </motion.div>
  )

  if (compact) return content

  return (
    <div className="flex h-full w-full flex-1 items-center justify-center">
      {content}
    </div>
  )
}

export default NetworkError
