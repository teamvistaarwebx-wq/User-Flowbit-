import { describe, expect, it, vi } from 'vitest'
import { BREAK_TYPES, UNTYPED_BREAK } from '@/lib/break-types'
import { CELL_META } from '@/modules/muster/attendance/register'
import { CHECKLIST_STEPS } from '@/modules/activation/checklist'
import { en } from './en'
import { hi, HI_STATUS } from './hi'
import { dynamicKey, format, greetingKey, localeOfUser, normaliseLocale, t } from './index'

vi.mock('server-only', () => ({}))

/** `{name}` and `{name:one|many}` placeholders, as a sorted set of names. */
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\w+)(?::[^}]*)?\}/g)].map((m) => m[1]))].sort()

describe('Hindi key parity', () => {
  const enKeys = Object.keys(en).sort()
  const hiKeys = Object.keys(hi).sort()

  it('has every English key, and no key English lacks', () => {
    expect(enKeys.filter((k) => !(k in hi))).toEqual([])
    expect(hiKeys.filter((k) => !(k in en))).toEqual([])
  })

  it('never leaves a Hindi string empty, and keeps the same placeholders', () => {
    for (const key of enKeys as (keyof typeof en)[]) {
      expect(hi[key].trim(), key).not.toBe('')
      expect(placeholders(hi[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('is marked for review', () => {
    expect(HI_STATUS).toBe('review')
  })

  it('covers every break type, attendance status, punch and Get started step', () => {
    for (const b of [...BREAK_TYPES, UNTYPED_BREAK]) expect(`break.${b}` in en, b).toBe(true)
    for (const s of Object.keys(CELL_META)) expect(`status.${s}` in en, s).toBe(true)
    for (const p of ['in', 'break_start', 'break_end', 'out']) expect(`punch.${p}` in en, p).toBe(true)
    for (const step of CHECKLIST_STEPS) {
      expect(`checklist.${step}.label` in en, step).toBe(true)
      expect(`checklist.${step}.hint` in en, step).toBe(true)
    }
  })
})

describe('t()', () => {
  it('fills values and picks plurals', () => {
    expect(format('{n} {n:day|days} left', { n: 1 })).toBe('1 day left')
    expect(format('{n} {n:day|days} left', { n: 3 })).toBe('3 days left')
    expect(format('Hello {who}', {})).toBe('Hello {who}')
    expect(t('en', 'me.leave.pending', { n: 2 })).toBe('2 days waiting on a decision')
    expect(t('hi', 'break.left', { left: 10, limit: 30 })).toBe('30 में से 10 मिनट बाकी')
  })

  it('reads the user preference and falls back to English', () => {
    expect(localeOfUser({ prefs: { locale: 'hi' } })).toBe('hi')
    expect(localeOfUser({ prefs: { locale: 'fr' } })).toBe('en')
    expect(localeOfUser(null)).toBe('en')
    expect(normaliseLocale(undefined)).toBe('en')
  })

  it('builds keys from data safely', () => {
    expect(dynamicKey('status.', 'absent', 'Absent', 'hi')).toBe('अनुपस्थित')
    expect(dynamicKey('status.', 'made_up', 'Made up', 'hi')).toBe('Made up')
  })

  it('greets by IST hour', () => {
    expect(greetingKey(9)).toBe('greet.morning')
    expect(greetingKey(14)).toBe('greet.afternoon')
    expect(greetingKey(20)).toBe('greet.evening')
  })
})

describe('bilingual payslip', () => {
  it('prints "English / Hindi" labels only when bilingual and the font is there', async () => {
    const { payslipLabels } = await import('@/modules/muster/payroll/payslip-pdf')
    expect(payslipLabels('en')('slip.netPay')).toBe('Net pay')
    expect(payslipLabels('bilingual', true)('slip.netPay')).toBe('Net pay / शुद्ध वेतन')
    expect(payslipLabels('bilingual', false)('slip.netPay')).toBe('Net pay')
    // Same in both languages: printed once.
    expect(payslipLabels('bilingual', true)('slip.pan')).toBe('PAN')
  })

  it('renders a PDF with the embedded Noto Sans Devanagari font', async () => {
    const { renderPayslipPdf } = await import('@/modules/muster/payroll/payslip-pdf')
    const data = {
      monthLabel: 'September 2026', payslipNumber: 'VW/2026/09/E001', employeeName: 'Aditi Singh', employeeCode: 'E001',
      workingDays: 26, payableDays: 26, lopDays: 0, totalEarnings: 5_000_000, totalDeductions: 360_000, reimbursementAmount: 0, netPay: 4_640_000,
      lines: [{ code: 'BASIC', label: 'Basic', lineType: 'earning', amount: 5_000_000 }, { code: 'PF', label: 'PF', lineType: 'deduction', amount: 360_000 }],
      snapshot: null,
    }
    const pdf = await renderPayslipPdf({ name: 'Vistaar WebX' }, data, 'bilingual')
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(pdf.toString('latin1')).toMatch(/NotoSansDevanagari/)
    const english = await renderPayslipPdf({ name: 'Vistaar WebX' }, data, 'en')
    expect(english.toString('latin1')).not.toMatch(/NotoSansDevanagari/)
  }, 30_000)
})
