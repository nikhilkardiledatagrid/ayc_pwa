/**
 * Shared field validators for PWA guest forms (WiFi, Lead/Loyalty, etc.).
 *
 * Each validator takes a raw input value and returns an error message
 * string, or null when the value is valid. Empty values are only flagged
 * by validateRequired — other validators skip empty input so a field can
 * be made optional simply by not calling validateRequired for it.
 */

const isEmpty = (value) => !value || !String(value).trim()

/** Non-empty (after trimming whitespace). */
export const validateRequired = (value, message) =>
  isEmpty(value) ? message : null

/**
 * Phone number — digits with an optional leading "+", spaces, hyphens and
 * brackets allowed for readability, between 7 and 15 digits overall (E.164 max).
 * Skips empty values (pair with validateRequired if the field is mandatory).
 */
export const validatePhone = (value, message) => {
  if (isEmpty(value)) return null
  const cleaned = String(value).trim()
  if (!/^\+?[0-9\s\-()]+$/.test(cleaned)) return message
  const digits = cleaned.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15 ? null : message
}

/**
 * Email address — RFC-pragmatic check (non-empty local part, single "@",
 * domain with TLD). Skips empty values.
 */
export const validateEmail = (value, message) => {
  if (isEmpty(value)) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()) ? null : message
}
