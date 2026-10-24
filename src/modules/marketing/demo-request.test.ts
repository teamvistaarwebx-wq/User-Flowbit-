import { describe, expect, it } from 'vitest'
import { demoRecipients, demoRequestMail, demoRequestSchema, firstNameOf, isBot } from './demo-request'

const valid = {
  name: 'Aditi Singh',
  email: 'Aditi@Example.in',
  company: 'Kalpa Studio',
  teamSize: '11-50',
  products: ['muster', 'folio'],
  message: 'We run payroll in spreadsheets today and want to move.',
}

describe('demoRequestSchema', () => {
  it('accepts a complete request and lowercases the email', () => {
    const parsed = demoRequestSchema.parse(valid)
    expect(parsed.email).toBe('aditi@example.in')
    expect(parsed.products).toEqual(['muster', 'folio'])
  })

  it('treats a single product as a list and a missing one as empty', () => {
    expect(demoRequestSchema.parse({ ...valid, products: 'orbit' }).products).toEqual(['orbit'])
    expect(demoRequestSchema.parse({ ...valid, products: undefined }).products).toEqual([])
  })

  it('refuses short messages, unknown team sizes and bad emails with field messages', () => {
    const result = demoRequestSchema.safeParse({ ...valid, message: 'hi', teamSize: '2', email: 'nope' })
    expect(result.success).toBe(false)
    const fields = result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
    expect(fields).toEqual(expect.arrayContaining(['message', 'teamSize', 'email']))
  })

  it('refuses an unknown product', () => {
    expect(demoRequestSchema.safeParse({ ...valid, products: ['slack'] }).success).toBe(false)
  })
})

describe('helpers', () => {
  it('detects a filled honeypot', () => {
    expect(isBot(demoRequestSchema.parse({ ...valid, website: 'http://spam.example' }))).toBe(true)
    expect(isBot(demoRequestSchema.parse(valid))).toBe(false)
  })

  it('takes the first name', () => {
    expect(firstNameOf('  Aditi   Singh ')).toBe('Aditi')
  })

  it('writes a staff email that names the company, size and products', () => {
    const mail = demoRequestMail(demoRequestSchema.parse(valid))
    expect(mail.subject).toBe('Demo request: Kalpa Studio (11–50 people)')
    expect(mail.paragraphs.join(' ')).toContain('Muster, Folio')
  })

  it('falls back to the support inbox when no platform admins are set', () => {
    expect(demoRecipients([], 'support@flowbit.app')).toEqual(['support@flowbit.app'])
    expect(demoRecipients(['a@x.in'], 'support@flowbit.app')).toEqual(['a@x.in'])
  })
})
