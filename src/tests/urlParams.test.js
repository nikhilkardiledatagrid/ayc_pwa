import { describe, it, expect } from 'vitest'
import { getDeviceParams, validateDeviceParams } from '../core/utils/urlParams'

const setSearch = (search) => {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { search },
  })
}

describe('getDeviceParams', () => {
  it('returns all params when fully populated', () => {
    setSearch('?venue_id=3&screen_id=22&table=7&scenario=A')
    expect(getDeviceParams()).toEqual({
      venue_id:  '3',
      screen_id: '22',
      table:     '7',
      scenario:  'A',
    })
  })

  it('defaults scenario to C when absent', () => {
    setSearch('?venue_id=3&screen_id=22&table=7')
    expect(getDeviceParams().scenario).toBe('C')
  })

  it('returns null for missing required params', () => {
    setSearch('?scenario=B')
    const params = getDeviceParams()
    expect(params.venue_id).toBeNull()
    expect(params.screen_id).toBeNull()
    expect(params.table).toBeNull()
  })

  it('returns empty string search as all nulls with scenario C', () => {
    setSearch('')
    expect(getDeviceParams()).toEqual({
      venue_id:  null,
      screen_id: null,
      table:     null,
      scenario:  'C',
    })
  })
})

describe('validateDeviceParams', () => {
  it('returns valid true when all required params are present', () => {
    const result = validateDeviceParams({ venue_id: '3', screen_id: '22', table: '7', scenario: 'A' })
    expect(result).toEqual({ valid: true, missing: [] })
  })

  it('returns valid false and lists missing venue_id', () => {
    const result = validateDeviceParams({ venue_id: null, screen_id: '22', table: '7', scenario: 'A' })
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('venue_id')
  })

  it('returns valid false and lists missing screen_id', () => {
    const result = validateDeviceParams({ venue_id: '3', screen_id: null, table: '7', scenario: 'A' })
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('screen_id')
  })

  it('returns valid false and lists missing table', () => {
    const result = validateDeviceParams({ venue_id: '3', screen_id: '22', table: null, scenario: 'A' })
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('table')
  })

  it('reports all three missing when no required params provided', () => {
    const result = validateDeviceParams({ venue_id: null, screen_id: null, table: null, scenario: 'C' })
    expect(result.valid).toBe(false)
    expect(result.missing).toEqual(['venue_id', 'screen_id', 'table'])
  })

  it('does not require scenario — scenario absence does not affect validity', () => {
    const result = validateDeviceParams({ venue_id: '3', screen_id: '22', table: '7' })
    expect(result.valid).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('treats empty string as missing', () => {
    const result = validateDeviceParams({ venue_id: '', screen_id: '22', table: '7', scenario: 'A' })
    expect(result.valid).toBe(false)
    expect(result.missing).toContain('venue_id')
  })
})
