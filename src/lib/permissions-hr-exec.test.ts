import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { resolvePermissions, BUILTIN_ROLES } from './permissions'
import { placeholderReference } from '@/modules/muster/letters/render'
import { buildReport } from '@/modules/muster/reports/builders'
import { REPORTS, REPORT_KEYS } from '@/modules/muster/reports/catalog'
import type { Ctx } from '@/lib/ctx'

/** Owner decision D3: the HR executive role does not see salaries. */
describe('HR executive and salaries (D3)', () => {
  const exec = resolvePermissions('hr_exec')
  const execCtx = { can: (p: string) => exec.has(p as never), hasFeature: () => true } as unknown as Ctx

  it('has no payroll permission at all', () => {
    expect([...exec].filter((p) => p.startsWith('payroll.'))).toEqual([])
    expect(exec.has('people.read_sensitive')).toBe(false)
    expect(BUILTIN_ROLES.hr_exec.description).toMatch(/does not see salaries/i)
  })

  it('keeps people, attendance, leave, claims and letters', () => {
    for (const p of ['people.write', 'attendance.manage', 'leave.approve', 'claims.review', 'letters.write', 'hr.reports'] as const) expect(exec.has(p)).toBe(true)
  })

  it('gets no salary placeholders in letters', () => {
    const keys = placeholderReference(exec.has('payroll.read')).flatMap((g) => g.keys.map((k) => k.key))
    expect(keys.some((k) => k.startsWith('salary.'))).toBe(false)
  })

  it('is refused every report that shows pay, before any data is read', async () => {
    const payReports = REPORT_KEYS.filter((k) => REPORTS[k].payroll)
    expect(payReports.length).toBeGreaterThan(0)
    for (const key of payReports) {
      const result = await buildReport(execCtx, key, '2026-09')
      expect(result).toMatchObject({ ok: false })
    }
  })
})
