import { describe, expect, it, test } from 'vitest'
import { toCsv } from '../reports/csv'
import { approvedAmountProblem, claimAmountProblem, claimFormState, claimWindowProblem, companyDay, decisionMessage, decisionRefusal, escapeHtml, expenseDateProblem, formCreatedMessage, isEligibleFor, windowFromDays } from './rules'
import { generateOtp, hashOtp, readClaimSession, signClaimSession, verifyOtpHash } from './session'
import { receiptMatches } from './receipt-sniff'

const SECRET = 'x'.repeat(40)

describe('claim form window', () => {
  const { opensAt, closesAt } = windowFromDays('2026-10-04', '2026-10-10')
  const form = { status: 'open', opensAt, closesAt }

  test('opens at IST midnight and closes at IST 23:59:59 of the deadline', () => {
    expect(companyDay(opensAt)).toBe('2026-10-04')
    expect(companyDay(closesAt)).toBe('2026-10-10')
    expect(closesAt.toISOString()).toBe('2026-10-10T18:29:59.000Z')
  })

  test('reads upcoming, open, ended and closed', () => {
    expect(claimFormState(form, new Date('2026-10-03T12:00:00Z'))).toBe('upcoming')
    expect(claimFormState(form, new Date('2026-10-06T12:00:00Z'))).toBe('open')
    expect(claimFormState(form, new Date('2026-10-11T12:00:00Z'))).toBe('ended')
    expect(claimFormState({ ...form, status: 'closed' }, new Date('2026-10-06T12:00:00Z'))).toBe('closed')
  })

  test('explains when a form does not take claims', () => {
    expect(claimWindowProblem(form, new Date('2026-10-03T12:00:00Z'))).toMatch(/takes claims from 4 Oct 2026 – 10 Oct 2026/)
    expect(claimWindowProblem(form, new Date('2026-10-11T12:00:00Z'))).toMatch(/no longer accepting claims/)
    expect(claimWindowProblem(form, new Date('2026-10-06T12:00:00Z'))).toBeNull()
  })
})

describe('claim amounts', () => {
  test('enforces the form cap and the category ceiling', () => {
    expect(claimAmountProblem(0, {})).toMatch(/at least/)
    expect(claimAmountProblem(6_000_00, { formCap: 5_000_00 })).toMatch(/capped at ₹5,000.00/)
    expect(claimAmountProblem(3_000_00, { categoryCap: 2_000_00, categoryName: 'Food' })).toMatch(/Food claims are capped/)
    expect(claimAmountProblem(1_250_00, { formCap: 5_000_00, categoryCap: null })).toBeNull()
  })

  test('a partial approval needs a note and cannot exceed the claim', () => {
    expect(approvedAmountProblem(800_00, 1_250_00, '')).toMatch(/Explain why/)
    expect(approvedAmountProblem(2_000_00, 1_250_00, 'x')).toMatch(/at most/)
    expect(approvedAmountProblem(800_00, 1_250_00, 'Only one meal is covered')).toBeNull()
  })

  test('refuses future expense dates', () => {
    expect(expenseDateProblem('2026-10-05', '2026-10-01')).toMatch(/not come yet/)
    expect(expenseDateProblem('2026-09-28', '2026-10-01')).toBeNull()
  })
})

describe('decisions', () => {
  test('a scheduled claim can no longer change', () => {
    expect(decisionRefusal('submitted')).toBeNull()
    expect(decisionRefusal('scheduled_for_payroll')).toMatch(/already in a payroll month/)
    expect(decisionRefusal('approved')).toMatch(/already been decided/)
  })

  test('messages name the person and the amounts', () => {
    expect(decisionMessage('approved', 'Aditi Singh', 1_250_00, 1_250_00)).toBe('Claim approved for Aditi Singh, ₹1,250.00. It is ready to send to payroll.')
    expect(decisionMessage('partially_approved', 'Aditi Singh', 1_250_00, 800_00)).toBe('₹800.00 of ₹1,250.00 approved for Aditi Singh. It is ready to send to payroll.')
  })

  test('escapes notes placed into email HTML', () => {
    expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;')
  })

  test('eligibility follows the selected list', () => {
    expect(isEligibleFor({ eligibility: 'all', eligibleEmployeeIds: [] }, 'a')).toBe(true)
    expect(isEligibleFor({ eligibility: 'selected', eligibleEmployeeIds: ['b'] }, 'a')).toBe(false)
  })

  test('creation message names who and when', () => {
    expect(formCreatedMessage('October expenses', null, '2026-10-01', '2026-10-10', '2026-10-01')).toBe('Claim form "October expenses" created, open to everyone until 10 Oct 2026. Share its link below.')
    expect(formCreatedMessage('Q4', 3, '2026-10-04', '2026-10-10', '2026-10-01')).toMatch(/created for 3 people. It opens on 4 Oct 2026/)
  })
})

describe('verification', () => {
  test('codes are six digits and verify only against their own hash', () => {
    const code = generateOtp()
    expect(code).toMatch(/^\d{6}$/)
    const hash = hashOtp(code, SECRET)
    expect(verifyOtpHash(code, hash, SECRET)).toBe(true)
    expect(verifyOtpHash(code === '000000' ? '111111' : '000000', hash, SECRET)).toBe(false)
  })

  test('a session cookie round-trips and refuses tampering and expiry', () => {
    const token = signClaimSession({ orgId: 'o', employeeId: 'e', formId: 'f', email: 'a@b.c' }, SECRET, 1_000)
    expect(readClaimSession(token, SECRET, 2_000)?.employeeId).toBe('e')
    expect(readClaimSession(`${token}x`, SECRET, 2_000)).toBeNull()
    expect(readClaimSession(token, 'y'.repeat(40), 2_000)).toBeNull()
    expect(readClaimSession(token, SECRET, 1_000 + 3_600_001)).toBeNull()
  })
})

describe('toCsv', () => {
  test('quotes fields with commas, quotes or newlines and defuses formulas', () => {
    expect(toCsv(['A', 'B'], [['x, y', 'say "hi"'], ['=SUM(1)', -12.5]])).toBe('A,B\r\n"x, y","say ""hi"""\r\n\'=SUM(1),-12.5')
  })
})

describe('receipt content check', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)].slice(0, 16))
  const text = (t: string) => new Uint8Array([...t].map((c) => c.charCodeAt(0)))
  it('accepts real PDFs and images and rejects renamed text', () => {
    expect(receiptMatches('application/pdf', text('%PDF-1.7\n'))).toBe(true)
    expect(receiptMatches('image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true)
    expect(receiptMatches('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true)
    expect(receiptMatches('image/heif', text('\0\0\0\x18ftypheic'))).toBe(true)
    expect(receiptMatches('image/png', text('just some text'))).toBe(false)
    expect(receiptMatches('image/png', text('%PDF-1.7'))).toBe(false)
  })
})
