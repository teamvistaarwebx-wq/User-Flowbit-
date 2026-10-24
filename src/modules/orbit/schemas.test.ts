import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { dealTitle, optInt, optUrl, parseImportRow, requiredPaise } from './schemas'

const message = (schema: z.ZodType, value: unknown) => schema.safeParse(value).error?.issues[0]?.message

describe('parseImportRow', () => {
  const base = { companyName: 'Bala Traders', sector: 'd2c', source: 'instagram' }

  it('keeps the lead and blanks a bad email or phone', () => {
    const res = parseImportRow({ ...base, email: 'bala@qa-import', phone: '022-2345 6789 ext 12', contactName: 'Bala' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.blanked.sort()).toEqual(['email', 'phone'])
    expect(res.row.email).toBeUndefined()
    expect(res.row.phone).toBeUndefined()
    expect(res.row.contactName).toBe('Bala')
  })

  it('passes a clean row through untouched', () => {
    const res = parseImportRow({ ...base, email: 'bala@traders.in', line: 4 })
    expect(res).toMatchObject({ ok: true, blanked: [], row: { email: 'bala@traders.in' } })
  })

  it('refuses a row without a company and says why', () => {
    const res = parseImportRow({ ...base, companyName: '' })
    expect(res).toEqual({ ok: false, error: 'Company is required' })
  })
})

describe('optUrl', () => {
  it('refuses text that is not a website', () => {
    expect(message(optUrl, 'not a site')).toBe('Enter a link like kesarclay.in')
    expect(message(optUrl, 'nowhere')).toBe('Enter a link like kesarclay.in')
  })
  it('adds https:// to a bare domain', () => {
    expect(optUrl.parse('kesarclay.in')).toBe('https://kesarclay.in')
    expect(optUrl.parse('https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij')
    expect(optUrl.parse('')).toBeUndefined()
  })
})

describe('deal field messages', () => {
  it('asks for a title and a value in plain words', () => {
    expect(message(dealTitle, undefined)).toBe('Add a title')
    expect(message(requiredPaise('Enter the deal value'), undefined)).toBe('Enter the deal value')
    expect(message(requiredPaise('Enter the deal value'), '')).toBe('Enter the deal value')
    expect(requiredPaise('Enter the deal value').parse('1,50,000')).toBe(15_000_000)
  })
  it('explains an out-of-range probability', () => {
    expect(message(optInt(0, 100), '150')).toBe('Use 0 to 100')
    expect(optInt(0, 100).parse('')).toBeUndefined()
  })
})
