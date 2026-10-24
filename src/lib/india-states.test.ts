import { describe, expect, it } from 'vitest'
import { gstinMatchesState, INDIA_STATES, stateByCode2, stateByGstCode, stateLabel, stateOfGstin, STATE_OPTIONS } from './india-states'
import { gstinStateIssue, INDIAN_STATES } from './validation'

describe('India states table', () => {
  it('has unique 2-letter and GST codes', () => {
    expect(new Set(INDIA_STATES.map((s) => s.code2)).size).toBe(INDIA_STATES.length)
    expect(new Set(INDIA_STATES.map((s) => s.gstCode)).size).toBe(INDIA_STATES.length)
  })

  it('maps both ways and reads GSTINs', () => {
    expect(stateByCode2('mp')?.gstCode).toBe('23')
    expect(stateByGstCode(27)?.code2).toBe('MH')
    expect(stateOfGstin('23ABCFV1234K1Z6')?.name).toBe('Madhya Pradesh')
    expect(gstinMatchesState('23ABCFV1234K1Z6', 'MP')).toBe(true)
    expect(gstinMatchesState('27AACCU8765Q1Z3', 'MP')).toBe(false)
    expect(stateLabel('MP')).toBe('Madhya Pradesh (23)')
  })

  it('keeps the legacy lookup and explains mismatches', () => {
    expect(INDIAN_STATES.MP).toEqual({ name: 'Madhya Pradesh', gst: '23', isUT: false })
    expect(gstinStateIssue('27AACCU8765Q1Z3', 'MP')).toBe('This GSTIN is registered in Maharashtra (27), but the state is Madhya Pradesh (23).')
    expect(gstinStateIssue('23ABCFV1234K1Z6', 'MP')).toBeNull()
    expect(STATE_OPTIONS.some((o) => o.value === 'OT')).toBe(false)
  })
})
