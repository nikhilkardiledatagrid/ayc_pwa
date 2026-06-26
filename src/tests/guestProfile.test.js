/**
 * guestProfile unit tests
 *
 * Covers:
 *   - splitMobile splits a known dial code, falls back to +971 for unknown ones
 *   - saveGuestProfile / getGuestProfile round-trip under the same session
 *   - getGuestProfile wipes and returns null for a profile from a stale session
 *   - saveGuestProfile merges new fields into the existing stored profile
 *   - clearGuestProfile removes the stored profile entirely
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  splitMobile,
  getGuestProfile,
  saveGuestProfile,
  clearGuestProfile,
} from '../core/utils/guestProfile'

beforeEach(() => {
  localStorage.clear()
})

describe('splitMobile', () => {
  it('splits a known UAE dial code', () => {
    expect(splitMobile('+971501234567')).toEqual({ countryCode: '+971', mobile: '501234567' })
  })

  it('falls back to +971 with the full string when no dial code matches', () => {
    expect(splitMobile('0501234567')).toEqual({ countryCode: '+971', mobile: '0501234567' })
  })
})

describe('saveGuestProfile / getGuestProfile', () => {
  it('returns null when nothing is stored', () => {
    expect(getGuestProfile('session-1')).toBeNull()
  })

  it('round-trips a profile saved under the same session', () => {
    saveGuestProfile({ first_name: 'Ahmed', last_name: 'Khan', mobile: '+971501234567' }, 'session-1')

    expect(getGuestProfile('session-1')).toEqual({
      first_name: 'Ahmed',
      last_name:  'Khan',
      mobile:     '+971501234567',
      session_id: 'session-1',
    })
  })

  it('wipes and returns null for a profile saved under a different (stale) session', () => {
    saveGuestProfile({ first_name: 'Ahmed', last_name: 'Khan', mobile: '+971501234567' }, 'session-1')

    expect(getGuestProfile('session-2')).toBeNull()
    // confirm it was actually wiped, not just filtered
    expect(getGuestProfile('session-1')).toBeNull()
  })

  it('merges new fields into the existing stored profile', () => {
    saveGuestProfile({ first_name: 'Ahmed', last_name: 'Khan' }, 'session-1')
    saveGuestProfile({ mobile: '+971501234567' }, 'session-1')

    expect(getGuestProfile('session-1')).toEqual({
      first_name: 'Ahmed',
      last_name:  'Khan',
      mobile:     '+971501234567',
      session_id: 'session-1',
    })
  })

  it('does nothing when no sessionId is given', () => {
    saveGuestProfile({ first_name: 'Ahmed' }, null)
    expect(localStorage.getItem('ayc_guest_profile')).toBeNull()
  })
})

describe('clearGuestProfile', () => {
  it('removes the stored profile', () => {
    saveGuestProfile({ first_name: 'Ahmed', last_name: 'Khan', mobile: '+971501234567' }, 'session-1')
    clearGuestProfile()
    expect(getGuestProfile('session-1')).toBeNull()
  })
})
