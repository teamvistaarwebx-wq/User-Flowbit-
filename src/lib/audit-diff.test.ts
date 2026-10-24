import { describe, expect, it } from 'vitest'
import { diff, maskAccount } from './audit-diff'

describe('diff', () => {
  it('keeps only changed keys from the union and ignores bookkeeping', () => {
    const before = { _id: 'x', name: 'Aditi', role: 'member', updatedAt: new Date('2026-01-01') }
    const after = { _id: 'x', name: 'Aditi', role: 'admin', title: 'Lead', updatedAt: new Date('2026-02-01') }
    expect(diff(before, after)).toEqual({ before: { role: 'member', title: undefined }, after: { role: 'admin', title: 'Lead' } })
  })

  it('stores after only for a create and before only for a delete', () => {
    expect(diff(null, { name: 'Acme' })).toEqual({ after: { name: 'Acme' } })
    expect(diff({ name: 'Acme' }, null)).toEqual({ before: { name: 'Acme' } })
  })

  it('redacts secrets and masks bank accounts, optionally statutory ids', () => {
    const d = diff({ passwordHash: 'a', bank: { accountNumber: '123456789012' }, pan: 'ABCDE1234F' }, { passwordHash: 'b', bank: { accountNumber: '999988887777' }, pan: 'ABCDE1234G' }, { redactIds: true })
    expect(d.after).toEqual({ passwordHash: '«redacted»', bank: { accountNumber: 'XXXXXXXX7777' }, pan: '«redacted»' })
    expect(maskAccount('1234')).toBe('1234')
  })
})
