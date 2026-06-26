/**
 * Applies the venue's theme overrides (from GET /pwa/device/config `theme`)
 * as CSS custom properties on the document root. A field that's null
 * (venue hasn't set it) removes any previous override instead, so the
 * static defaults in index.css take over.
 *
 * primary_color, secondary_color, background_color, text_color, heading_font
 * and text_font map onto CSS vars already consumed across the PWA (Tailwind
 * utilities + base-layer rules), so overriding them takes effect everywhere
 * immediately. heading_color, heading_font_size and text_font_size are wired
 * to vars that no journey screen consumes yet — those screens hardcode their
 * own Tailwind size/color classes per element, so adopting these three needs
 * a per-screen pass, not just this scaffold.
 */
const THEME_VAR_MAP = {
  primary_color:      '--color-primary',
  secondary_color:    '--color-secondary',
  background_color:   '--color-background',
  text_color:         '--color-fg',
  heading_color:      '--color-heading',
  heading_font:       '--font-display',
  text_font:          '--font-sans',
  heading_font_size:  '--font-size-heading',
  text_font_size:     '--font-size-body',
  button_text_color:  '--color-button-text',
  input_bg_color:     '--color-input-bg',
  input_text_color:   '--color-input-text',
}

export const applyVenueTheme = (theme) => {
  const root = document.documentElement.style

  for (const [field, cssVar] of Object.entries(THEME_VAR_MAP)) {
    const value = theme?.[field]
    if (value) {
      root.setProperty(cssVar, value)
    } else {
      root.removeProperty(cssVar)
    }
  }
}
