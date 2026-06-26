import { describe, it, expect, afterEach } from 'vitest'
import { applyVenueTheme } from '../core/utils/applyVenueTheme'

const getVar = (name) => document.documentElement.style.getPropertyValue(name)

afterEach(() => {
  // Reset every var the util can touch so tests don't leak into each other
  applyVenueTheme(null)
})

describe('applyVenueTheme', () => {
  it('sets a CSS var for every theme field that has a value', () => {
    applyVenueTheme({
      primary_color:     '#E13437',
      secondary_color:   '#222222',
      background_color:  '#FFFFFF',
      text_color:        '#333333',
      heading_color:     '#000000',
      heading_font:       'Poppins',
      text_font:          'Inter',
      heading_font_size:  '28px',
      text_font_size:     '16px',
    })

    expect(getVar('--color-primary')).toBe('#E13437')
    expect(getVar('--color-secondary')).toBe('#222222')
    expect(getVar('--color-background')).toBe('#FFFFFF')
    expect(getVar('--color-fg')).toBe('#333333')
    expect(getVar('--color-heading')).toBe('#000000')
    expect(getVar('--font-display')).toBe('Poppins')
    expect(getVar('--font-sans')).toBe('Inter')
    expect(getVar('--font-size-heading')).toBe('28px')
    expect(getVar('--font-size-body')).toBe('16px')
  })

  it('removes the override for any field that is null, falling back to the CSS default', () => {
    applyVenueTheme({ primary_color: '#E13437' })
    expect(getVar('--color-primary')).toBe('#E13437')

    applyVenueTheme({ primary_color: null })
    expect(getVar('--color-primary')).toBe('')
  })

  it('treats a null theme object as clearing every override', () => {
    applyVenueTheme({ primary_color: '#E13437', heading_font: 'Poppins' })

    applyVenueTheme(null)

    expect(getVar('--color-primary')).toBe('')
    expect(getVar('--font-display')).toBe('')
  })

  it('treats an undefined theme object the same as null', () => {
    applyVenueTheme({ primary_color: '#E13437' })

    applyVenueTheme(undefined)

    expect(getVar('--color-primary')).toBe('')
  })

  it('is a full reapply, not a merge — a field absent from the new call is cleared', () => {
    applyVenueTheme({ primary_color: '#E13437', secondary_color: '#222222' })

    applyVenueTheme({ primary_color: '#FF0000' })

    expect(getVar('--color-primary')).toBe('#FF0000')
    expect(getVar('--color-secondary')).toBe('')
  })
})
