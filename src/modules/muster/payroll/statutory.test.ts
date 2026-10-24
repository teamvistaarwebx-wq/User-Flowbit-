import { describe, expect, test } from 'vitest'
import { DEFAULT_STATUTORY, EPF_WAGE_CEILING, outdatedPfCeiling, parseStatutory, readStatutory, type StatutorySettings } from './statutory'
import { statutoryBlock } from './timeline'

const withPf = (pf: Partial<StatutorySettings['pf']>): StatutorySettings => ({ ...DEFAULT_STATUTORY, pf: { ...DEFAULT_STATUTORY.pf, ...pf } })

/** A confirmed version saved before LWF existed: no `lwf` key, PF capped at the old ₹15,000. */
const SAVED_BEFORE_LWF = { pf: { ...DEFAULT_STATUTORY.pf, wageCeiling: 15000 }, esi: DEFAULT_STATUTORY.esi, tds: DEFAULT_STATUTORY.tds, pt: DEFAULT_STATUTORY.pt }
const CONFIRMED = { effectiveFrom: '2000-01-01', payrollFrom: '2000-01-01', confirmedAt: '2026-04-01' }

describe('parseStatutory', () => {
  test('a version saved before LWF existed keeps its stored ₹15,000 PF ceiling', () => {
    const settings = parseStatutory(SAVED_BEFORE_LWF)
    expect(settings.pf.wageCeiling).toBe(15000)
    expect(settings).toEqual({ ...SAVED_BEFORE_LWF, lwf: DEFAULT_STATUTORY.lwf })
  })

  test('only the malformed section falls back to its default', () => {
    const settings = parseStatutory({ ...SAVED_BEFORE_LWF, lwf: [], pt: 'MP' })
    expect(settings.pf.wageCeiling).toBe(15000)
    expect(settings.lwf).toEqual([])
    expect(settings.pt).toEqual(DEFAULT_STATUTORY.pt)
  })
})

describe('readStatutory', () => {
  test('names a section that fell back, and payroll still runs when it is not PF or ESI', () => {
    const { unreadable } = readStatutory(SAVED_BEFORE_LWF)
    expect(unreadable).toEqual(['lwf'])
    expect(statutoryBlock(CONFIRMED, 2026, 10, unreadable)).toBeNull()
  })

  test('surfaces a malformed PF section and blocks payroll instead of using the default ceiling', () => {
    const { unreadable } = readStatutory({ ...SAVED_BEFORE_LWF, lwf: [], pf: { ...SAVED_BEFORE_LWF.pf, wageCeiling: '15000' } })
    expect(unreadable).toEqual(['pf'])
    expect(statutoryBlock(CONFIRMED, 2026, 10, unreadable)).toMatch(/^The PF rates for 2026-10 — effective 2000-01-01 — could not be read/)
  })

  test('blocks on unreadable ESI too, naming both sections', () => {
    const { unreadable } = readStatutory({ ...SAVED_BEFORE_LWF, pf: null, esi: { enabled: true } })
    expect(unreadable).toEqual(['pf', 'esi', 'lwf'])
    expect(statutoryBlock(CONFIRMED, 2026, 10, unreadable)).toMatch(/^The PF and ESI rates for 2026-10/)
  })

  test('settings that are not an object are unreadable throughout', () => {
    expect(readStatutory(null)).toEqual({ settings: DEFAULT_STATUTORY, unreadable: ['pf', 'esi', 'tds', 'pt', 'lwf'] })
  })
})

describe('EPF wage ceiling', () => {
  test('new rates start from the ₹25,000 ceiling in force since 17 Sep 2026', () => {
    expect(EPF_WAGE_CEILING).toEqual({ rupees: 25000, effectiveFrom: '2026-09-17', notification: 'S.O. 5109(E)' })
    expect(DEFAULT_STATUTORY.pf.wageCeiling).toBe(25000)
  })
})

describe('outdatedPfCeiling', () => {
  test('returns the old ceiling when the latest rates still cap PF at ₹15,000', () => {
    expect(outdatedPfCeiling(withPf({ wageCeiling: 15000 }), '2026-10-05')).toBe(15000)
  })

  test('returns null once the rates carry the new ceiling or a higher one', () => {
    expect(outdatedPfCeiling(withPf({ wageCeiling: 25000 }), '2026-10-05')).toBeNull()
    expect(outdatedPfCeiling(withPf({ wageCeiling: 30000 }), '2026-10-05')).toBeNull()
  })

  test('returns null when PF is not capped or not deducted at all', () => {
    expect(outdatedPfCeiling(withPf({ wageCeiling: 15000, applyCeiling: false }), '2026-10-05')).toBeNull()
    expect(outdatedPfCeiling(withPf({ wageCeiling: 15000, enabled: false }), '2026-10-05')).toBeNull()
  })

  test('returns null before the new ceiling took effect', () => {
    expect(outdatedPfCeiling(withPf({ wageCeiling: 15000 }), '2026-09-16')).toBeNull()
    expect(outdatedPfCeiling(withPf({ wageCeiling: 15000 }), '2026-09-17')).toBe(15000)
  })
})
