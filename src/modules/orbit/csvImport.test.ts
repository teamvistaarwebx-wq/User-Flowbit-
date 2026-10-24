import { describe, expect, it } from 'vitest'
import { badFields, mapRows, resolveHeaders } from './csvImport'
import { DEFAULT_SECTORS, DEFAULT_SOURCES } from './constants'

const settings = { sectors: DEFAULT_SECTORS, sources: DEFAULT_SOURCES }

describe('resolveHeaders', () => {
  it('maps Company Name to company, not contact', () => {
    const cols = resolveHeaders(['Company Name', 'Name'])
    expect(cols.company).toBe(0)
    expect(cols.contact).toBe(1)
  })
  it('maps LinkedIn URL to linkedin, not website', () => {
    const cols = resolveHeaders(['LinkedIn URL', 'URL'])
    expect(cols.linkedin).toBe(0)
    expect(cols.website).toBe(1)
  })
  it('prefers exact matches over fuzzy ones and never reuses a column', () => {
    const cols = resolveHeaders(['Primary Email Address', 'email'])
    expect(cols.email).toBe(1)
    const one = resolveHeaders(['company_name'])
    expect(one.company).toBe(0)
    expect(one.contact).toBeUndefined()
  })
})

describe('mapRows', () => {
  it('skips rows without a company and counts unknown sectors as other', () => {
    const res = mapRows(
      [
        ['Brand', 'Sector', 'Source'],
        ['Kesar & Clay', 'D2C', 'instagram'],
        ['', 'D2C', 'instagram'],
        ['Narmada Realty', 'Development & NGO', 'Referral'],
        ['Indus Leaf', 'Fintech', 'cold call'],
      ],
      settings,
    )
    expect(res.rows).toHaveLength(3)
    expect(res.skippedNoCompany).toBe(1)
    expect(res.rows[1].sector).toBe('dev_ngo')
    expect(res.rows[1].source).toBe('referral')
    expect(res.rows[2].sector).toBe('other')
    expect(res.mappedToOther).toEqual({ sector: 1, source: 1 })
  })
  it('caps an import at 2000 rows', () => {
    const cells = [['Company'], ...Array.from({ length: 2100 }, (_, i) => [`Co ${i}`])]
    const res = mapRows(cells, settings)
    expect(res.tooMany).toBe(true)
    expect(res.rows).toHaveLength(2000)
  })
})

describe('mapRows row checks', () => {
  it('numbers rows by CSV line and flags bad optional fields', () => {
    const res = mapRows(
      [
        ['Company', 'Email', 'Phone', 'Website'],
        ['Kesar & Clay', 'hello@kesarclay.in', '98200 12345', 'kesarclay.in'],
        ['', '', '', ''],
        ['Bala Traders', 'bala@qa-import', '022-2345 6789 ext 12', 'not a site'],
      ],
      settings,
    )
    expect(res.rows.map((r) => r.line)).toEqual([2, 4])
    expect(res.withBadFields).toBe(1)
    expect(badFields(res.rows[0])).toEqual([])
    expect(badFields(res.rows[1])).toEqual(['email', 'phone', 'website'])
  })
})
