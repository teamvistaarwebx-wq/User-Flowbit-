import { describe, expect, it } from 'vitest'
import { DEFAULT_ITEMS, dueDatesBetween, readComplianceSettings, type ComplianceSettings } from './rules'

const ALL: ComplianceSettings = { filerType: 'monthly', state: 'MP', items: ['gstr1', 'gstr3b', 'pmt06', 'tds_deposit', 'tds_return', 'pf', 'esi', 'pt', 'advance_tax'], ptDay: null, overrides: [] }
const dates = (s: ComplianceSettings, from: string, to: string, item: string) => dueDatesBetween(s, from, to).filter((d) => d.item === item).map((d) => `${d.dueDate} ${d.period}`)

describe('compliance due dates, FY 2026-27', () => {
  it('monthly filer: GSTR-1 on the 11th and GSTR-3B on the 20th of the next month', () => {
    expect(dates(ALL, '2026-10-01', '2026-10-31', 'gstr1')).toEqual(['2026-10-11 2026-09'])
    expect(dates(ALL, '2026-10-01', '2026-10-31', 'gstr3b')).toEqual(['2026-10-20 2026-09'])
    expect(dates(ALL, '2026-10-01', '2026-10-31', 'pmt06')).toEqual([])
  })

  it('QRMP: GSTR-1 by the 13th after the quarter, GSTR-3B on the 22nd or 24th by state, PMT-06 on the 25th of the first two months', () => {
    const mp = { ...ALL, filerType: 'qrmp' as const, state: 'MP' }
    const dl = { ...mp, state: 'DL' }
    expect(dates(mp, '2026-10-01', '2026-10-31', 'gstr1')).toEqual(['2026-10-13 2026-Q2'])
    expect(dates(mp, '2026-10-01', '2026-10-31', 'gstr3b')).toEqual(['2026-10-22 2026-Q2'])
    expect(dates(dl, '2026-10-01', '2026-10-31', 'gstr3b')).toEqual(['2026-10-24 2026-Q2'])
    expect(dates(mp, '2026-11-01', '2026-12-31', 'pmt06')).toEqual(['2026-11-25 2026-10', '2026-12-25 2026-11'])
    expect(dates(mp, '2026-11-01', '2026-12-31', 'gstr1')).toEqual([])
    expect(dates(mp, '2027-04-01', '2027-04-30', 'gstr3b')).toEqual(['2027-04-22 2026-Q4'])
  })

  it('TDS: deposit on the 7th, March by 30 April; returns 31 Jul, 31 Oct, 31 Jan, 31 May', () => {
    expect(dates(ALL, '2027-04-01', '2027-04-30', 'tds_deposit')).toEqual(['2027-04-30 2027-03'])
    expect(dates(ALL, '2027-04-01', '2027-04-29', 'tds_deposit')).toEqual([])
    expect(dates(ALL, '2026-11-01', '2026-11-30', 'tds_deposit')).toEqual(['2026-11-07 2026-10'])
    expect(dates(ALL, '2026-04-01', '2027-06-30', 'tds_return').map((d) => d.slice(0, 10))).toEqual(['2026-05-31', '2026-07-31', '2026-10-31', '2027-01-31', '2027-05-31'])
  })

  it('PF and ESI on the 15th; advance tax on 15 Jun, Sep, Dec and Mar', () => {
    expect(dates(ALL, '2026-10-01', '2026-10-31', 'pf')).toEqual(['2026-10-15 2026-09'])
    expect(dates(ALL, '2026-10-01', '2026-10-31', 'esi')).toEqual(['2026-10-15 2026-09'])
    expect(dates(ALL, '2026-04-01', '2027-03-31', 'advance_tax').map((d) => d.slice(0, 10))).toEqual(['2026-06-15', '2026-09-15', '2026-12-15', '2027-03-15'])
  })

  it('professional tax follows the state default, a day of your own, or is off', () => {
    expect(dates({ ...ALL, state: 'KA' }, '2026-10-01', '2026-10-31', 'pt')).toEqual(['2026-10-20 2026-09'])
    expect(dates({ ...ALL, state: 'MH' }, '2026-10-01', '2026-10-31', 'pt')).toEqual(['2026-10-31 2026-09'])
    expect(dates({ ...ALL, state: 'MH' }, '2026-11-01', '2026-11-30', 'pt')).toEqual(['2026-11-30 2026-10'])
    expect(dates({ ...ALL, state: 'DL' }, '2026-10-01', '2026-10-31', 'pt')).toEqual([])
    expect(dates({ ...ALL, state: 'DL', ptDay: 5 }, '2026-10-01', '2026-10-31', 'pt')).toEqual(['2026-10-05 2026-09'])
    expect(dates({ ...ALL, state: 'KA', ptDay: 0 }, '2026-10-01', '2026-10-31', 'pt')).toEqual([])
  })

  it('an extension moves that one occurrence and is marked; switched-off items never show', () => {
    const extended = { ...ALL, overrides: [{ item: 'gstr3b' as const, period: '2026-09', dueDate: '2026-10-25', note: 'CBIC notification 12/2026' }] }
    const items = dueDatesBetween(extended, '2026-10-01', '2026-10-31').filter((d) => d.item === 'gstr3b')
    expect(items).toEqual([expect.objectContaining({ dueDate: '2026-10-25', extended: true, note: 'CBIC notification 12/2026' })])
    expect(dates(extended, '2026-11-01', '2026-11-30', 'gstr3b')).toEqual(['2026-11-20 2026-10'])
    expect(dueDatesBetween({ ...ALL, items: ['pf'] }, '2026-10-01', '2026-10-31').map((d) => d.item)).toEqual(['pf'])
  })

  it('sorts by date and reads stored settings safely', () => {
    const all = dueDatesBetween(ALL, '2026-10-01', '2026-10-31').map((d) => d.dueDate)
    expect([...all].sort()).toEqual(all)
    expect(readComplianceSettings({})).toMatchObject({ filerType: 'monthly', items: [...DEFAULT_ITEMS], ptDay: null, overrides: [] })
    expect(readComplianceSettings({ filerType: 'qrmp', items: ['gstr1', 'nope'], ptDay: 99, overrides: [{ item: 'pf', period: '2026-09', dueDate: 'soon' }] })).toMatchObject({ filerType: 'qrmp', items: ['gstr1'], ptDay: null, overrides: [] })
  })
})
