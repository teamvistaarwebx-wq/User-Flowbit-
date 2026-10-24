import { describe, expect, it } from 'vitest'
import { can24qExport, hasForm130Worksheet } from './export-access'

describe('Salary tax export links match the routes (night check)', () => {
  it('offers 24Q only with payroll, sensitive details and the whole company in view', () => {
    expect(can24qExport({ payrollRead: true, sensitive: true, seesEveryone: true })).toBe(true)
    // hr_exec-style roles: payroll read without sensitive details got a 24Q link that answered 403
    expect(can24qExport({ payrollRead: true, sensitive: false, seesEveryone: true })).toBe(false)
    expect(can24qExport({ payrollRead: true, sensitive: true, seesEveryone: false })).toBe(false)
  })

  it('offers Form 130 only to people with a worksheet', () => {
    expect(hasForm130Worksheet('a', new Set(['a']), new Set())).toBe(true)
    expect(hasForm130Worksheet('b', new Set(), new Set(['b']))).toBe(true)
    expect(hasForm130Worksheet('c', new Set(['a']), new Set(['b']))).toBe(false)
  })
})
