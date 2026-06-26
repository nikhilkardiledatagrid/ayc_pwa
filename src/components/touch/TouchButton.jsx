/**
 * TouchButton — large touch-optimised base button for PWA kiosk use.
 *
 * Rules (CLAUDE.md):
 *   - Min 48×48px touch target — enforced via min-h / min-w
 *   - NO hover states — this is a touch-only device
 *   - active: pseudo for tactile feedback
 */
const TouchButton = ({
  onClick,
  children,
  className = '',
  disabled = false,
  ...rest
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    {...rest}
    className={[
      'min-h-[48px] min-w-[48px]',
      'select-none',
      'active:scale-[0.97] transition-transform duration-100',
      disabled ? 'opacity-40 pointer-events-none' : '',
      className,
    ].filter(Boolean).join(' ')}
  >
    {children}
  </button>
)

export default TouchButton
