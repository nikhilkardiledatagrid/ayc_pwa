/**
 * NotConfiguredState
 *
 * Shown inside a journey screen when its underlying data hasn't been set up yet
 * by the venue (e.g. no Google review link, no loyalty form). Mirrors the WiFi
 * screen's "No Wi-Fi Configured" empty state so the three bottom-bar journeys
 * read consistently when unconfigured.
 *
 * @param {{ title: string, message: string }} props
 */
const NotConfiguredState = ({ title, message }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border shadow-card">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </div>
    <p className="font-display text-[16px] font-bold text-fg">{title}</p>
    <p className="text-center text-[13px] text-fg-muted">{message}</p>
  </div>
)

export default NotConfiguredState
