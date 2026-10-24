import { describe, expect, it } from 'vitest'
import { buildReport, parseReportParams, sectionsFor } from './build'
import { reportCsv } from './csv'
import { cohort, funnelReport, furthestStep, marketingReport, teamReport, type ReportAccount } from './funnel'
import { collectionsByMonth, monthsEnding, mrrMovement, mrrOn, overdueBills, renewalsDue, tdsPending, walletMonths, type MoneyInvoice } from './money'
import type { ReportData } from './query'

const NOW = new Date('2026-10-20T06:00:00Z')
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)

const account = (id: string, over: Partial<ReportAccount> = {}): ReportAccount => ({
  id,
  name: `Org ${id}`,
  createdAt: ago(10),
  accountType: 'trial',
  inMetrics: true,
  deleted: false,
  signupType: 'trial',
  setupStarted: false,
  imported: false,
  health: null,
  paidAt: null,
  mrrPaise: 0,
  salespersonId: null,
  utmSource: 'Direct',
  utmMedium: null,
  utmCampaign: null,
  ...over,
})

/** Ten signups in the last 90 days at every stage, an old one, and an Internal one that must never count. */
const ACCOUNTS: ReportAccount[] = [
  account('a', { signupType: 'free', accountType: 'free', utmSource: 'google', utmCampaign: 'tab-tax', salespersonId: 's1' }),
  account('b', { signupType: 'free', accountType: 'free', imported: true, utmSource: 'google', utmCampaign: 'tab-tax', salespersonId: 's1' }),
  account('c', { setupStarted: true, salespersonId: 's1' }),
  account('d', { setupStarted: true, health: 'green', salespersonId: 's2' }),
  account('e', { health: 'green', createdAt: ago(40), salespersonId: 's2' }),
  account('f', { accountType: 'paid', paidAt: ago(5), mrrPaise: 149_000, setupStarted: true, health: 'green', utmSource: 'google', utmCampaign: 'tab-tax', salespersonId: 's1' }),
  account('g', { accountType: 'paid', paidAt: ago(2), mrrPaise: 59_000, createdAt: ago(60), utmSource: 'linkedin', salespersonId: 's2' }),
  account('h', { createdAt: ago(80), deleted: true }),
  account('i', { signupType: 'free', accountType: 'free', createdAt: ago(85) }),
  account('j', { createdAt: ago(3) }),
  account('old', { createdAt: ago(400), accountType: 'paid', paidAt: ago(300), mrrPaise: 100_000, salespersonId: 's1' }),
  account('internal', { inMetrics: false, accountType: 'internal', createdAt: ago(5), paidAt: ago(1), mrrPaise: 999_999, salespersonId: 's1' }),
]
const PERIOD_90 = { from: ago(90), to: NOW }

describe('reports: funnel', () => {
  it('counts each step as "reached it or later" and never grows', () => {
    const f = funnelReport(ACCOUNTS, PERIOD_90, NOW)
    expect(f.rows.map((r) => [r.step, r.count])).toEqual([['signup', 10], ['started', 10], ['setup', 6], ['habit', 4], ['paid', 2]])
    expect(f.rows[4]).toMatchObject({ fromPrevious: 50, fromSignup: 20 })
    expect(f.split).toEqual({ free: 3, trial: 7 })
  })

  it('shows where accounts stall, and lists live ones longest first (deleted ones counted, not listed)', () => {
    const f = funnelReport(ACCOUNTS, PERIOD_90, NOW)
    expect(f.stalls.map((s) => [s.step, s.count])).toEqual([['started', 4], ['setup', 2], ['habit', 2]])
    expect(f.stalled.map((s) => s.id)).toEqual(['i', 'e', 'a', 'b', 'c', 'd', 'j'])
    expect(f.stalled.find((s) => s.id === 'h')).toBeUndefined()
    expect(furthestStep(ACCOUNTS[1])).toBe('setup')
  })

  it('leaves Internal and Test workspaces out of every cohort', () => {
    expect(cohort(ACCOUNTS, { from: null, to: NOW }).some((a) => a.id === 'internal')).toBe(false)
  })
})

describe('reports: team and marketing', () => {
  it('gives each salesperson their accounts, signups, first payments and MRR; Sales sees only their own row', () => {
    const staff = [{ id: 's1', name: 'Asha' }, { id: 's2', name: 'Ravi' }]
    const rows = teamReport(ACCOUNTS, staff, PERIOD_90)
    expect(rows.find((r) => r.staffId === 's1')).toMatchObject({ accounts: 5, free: 2, trial: 1, paid: 2, signups: 4, conversions: 1, conversionRate: 25, mrrPaise: 249_000 })
    expect(rows.find((r) => r.staffId === null)).toMatchObject({ name: 'Unassigned', accounts: 2 })
    expect(teamReport(ACCOUNTS, staff, PERIOD_90, 's2')).toEqual([expect.objectContaining({ staffId: 's2', accounts: 3, conversions: 1 })])
  })

  it('groups signups by first-touch UTM with conversion', () => {
    const bySource = marketingReport(ACCOUNTS, PERIOD_90, 'source')
    expect(bySource[0]).toMatchObject({ key: 'Direct', signups: 6, paid: 0 })
    expect(bySource.find((r) => r.key === 'google')).toMatchObject({ signups: 3, free: 2, paid: 1, conversionRate: 33.3, mrrPaise: 149_000 })
    expect(marketingReport(ACCOUNTS, PERIOD_90, 'campaign').find((r) => r.key === 'tab-tax')?.signups).toBe(3)
  })
})

const inv = (orgId: string, over: Partial<MoneyInvoice> = {}): MoneyInvoice => ({
  orgId,
  kind: 'subscription',
  status: 'paid',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  cycle: 'monthly',
  taxableValuePaise: 100_000,
  totalPaise: 118_000,
  receivedPaise: 118_000,
  paidOn: '2026-09-01',
  dueDate: null,
  isTest: false,
  tds: null,
  ...over,
})

/** September: A monthly ₹1,000, B monthly ₹500, C yearly ₹12,000, D monthly ₹800 (not renewed). October: A renews at ₹1,500, B renews flat, C runs on, E is new at ₹2,000, D churns. */
const INVOICES: MoneyInvoice[] = [
  inv('A'),
  inv('A', { periodStart: '2026-10-01', periodEnd: '2026-10-31', taxableValuePaise: 150_000, totalPaise: 177_000, receivedPaise: 177_000, paidOn: '2026-10-01' }),
  inv('B', { taxableValuePaise: 50_000, totalPaise: 59_000, receivedPaise: 59_000 }),
  inv('B', { periodStart: '2026-10-01', periodEnd: '2026-10-31', taxableValuePaise: 50_000, totalPaise: 59_000, receivedPaise: 59_000, paidOn: '2026-10-01' }),
  inv('C', { periodStart: '2026-04-01', periodEnd: '2027-03-31', cycle: 'yearly', taxableValuePaise: 1_200_000, totalPaise: 1_416_000, receivedPaise: 1_388_000, paidOn: '2026-04-02', tds: { declared: true, amountPaise: 24_000, certificateStatus: 'awaited' } }),
  inv('D', { taxableValuePaise: 80_000, totalPaise: 94_400, receivedPaise: 94_400 }),
  inv('E', { periodStart: '2026-10-05', periodEnd: '2026-11-04', taxableValuePaise: 200_000, totalPaise: 236_000, receivedPaise: 236_000, paidOn: '2026-10-05' }),
  inv('T', { periodStart: '2026-10-01', periodEnd: '2026-10-31', isTest: true, paidOn: '2026-10-01' }),
  inv('W', { kind: 'wallet_recharge', taxableValuePaise: 50_000, totalPaise: 59_000, receivedPaise: 59_000, paidOn: '2026-10-07' }),
  inv('X', { status: 'due', dueDate: '2026-10-10', periodStart: '2026-10-01', periodEnd: '2026-10-31', receivedPaise: 18_000 }),
]

describe('reports: MRR movements', () => {
  it('reads MRR per workspace from the plan invoice covering the day (yearly ÷ 12), ignoring tests, recharges and due bills', () => {
    const sept = mrrOn(INVOICES, '2026-09-15')
    expect(Object.fromEntries(sept)).toEqual({ A: 100_000, B: 50_000, C: 100_000, D: 80_000 })
  })

  it('splits the month into new, expansion and churned MRR', () => {
    const m = mrrMovement(INVOICES, '2026-10', '2026-10-20')
    expect(m.startPaise).toBe(330_000)
    expect(m).toMatchObject({ newPaise: 200_000, expansionPaise: 50_000, contractionPaise: 0, churnedPaise: 80_000, counts: { new: 1, expansion: 1, contraction: 0, churned: 1 } })
    expect(m.endPaise).toBe(m.startPaise + m.newPaise + m.expansionPaise - m.contractionPaise - m.churnedPaise)
  })

  it('does not count a plan as churned during the 7-day payment grace', () => {
    const late = INVOICES.filter((i) => !(i.orgId === 'B' && i.periodStart === '2026-10-01'))
    // B and D ended on 30 Sep: still covered on 5 Oct, churned once the grace ends on 7 Oct.
    expect(mrrMovement(late, '2026-10', '2026-10-05').counts.churned).toBe(0)
    expect(mrrMovement(late, '2026-10', '2026-10-09').counts.churned).toBe(2)
  })
})

describe('reports: collections, TDS, overdue, renewals, wallet', () => {
  it('collects real money by month, plans and wallet apart', () => {
    const [sep, oct] = collectionsByMonth(INVOICES, ['2026-09', '2026-10'])
    expect(sep).toEqual({ month: '2026-09', planPaise: 118_000 + 59_000 + 94_400, walletPaise: 0, totalPaise: 271_400 })
    expect(oct).toMatchObject({ planPaise: 177_000 + 59_000 + 236_000, walletPaise: 59_000 })
  })

  it('lists TDS awaited and overdue bills by balance', () => {
    expect(tdsPending(INVOICES)).toEqual({ count: 1, paise: 24_000 })
    expect(overdueBills(INVOICES, '2026-10-20')).toEqual({ count: 1, paise: 100_000 })
    expect(overdueBills(INVOICES, '2026-10-09').count).toBe(0)
  })

  it('finds renewals in the next 30 days, skipping plans that will not renew', () => {
    const r = renewalsDue([
      { id: '1', name: 'Soon', periodEnd: new Date(NOW.getTime() + 5 * DAY), amountPaise: 100_000, cycle: 'monthly', autopay: true, cancelAtPeriodEnd: false, paid: true },
      { id: '2', name: 'Later', periodEnd: new Date(NOW.getTime() + 45 * DAY), amountPaise: 100_000, cycle: 'yearly', autopay: false, cancelAtPeriodEnd: false, paid: true },
      { id: '3', name: 'Ending', periodEnd: new Date(NOW.getTime() + 3 * DAY), amountPaise: 100_000, cycle: 'monthly', autopay: false, cancelAtPeriodEnd: true, paid: true },
    ], NOW)
    expect(r.rows.map((x) => x.id)).toEqual(['1'])
    expect(r.paise).toBe(100_000)
  })

  it('computes wallet recharges and message margin: paid credit used, less refunds and the managed-mode provider cost', () => {
    const at = new Date('2026-10-10T06:00:00Z')
    const rows = [
      { orgId: 'M', type: 'recharge', at, amountPaise: 100_000, paidPaise: 0, category: null },
      { orgId: 'M', type: 'debit', at, amountPaise: 25, paidPaise: 25, category: 'utility' },
      { orgId: 'M', type: 'debit', at, amountPaise: 25, paidPaise: 0, category: 'utility' },
      { orgId: 'M', type: 'refund', at, amountPaise: 25, paidPaise: 25, category: null },
      { orgId: 'M', type: 'debit', at, amountPaise: 125, paidPaise: 125, category: 'marketing' },
      { orgId: 'B', type: 'debit', at, amountPaise: 10, paidPaise: 10, category: 'utility' },
    ]
    const [w] = walletMonths(rows, ['2026-10'], new Set(['M']), { utility: 15, marketing: 95.8 })
    expect(w).toEqual({ month: '2026-10', rechargePaise: 100_000, revenuePaise: 135, costPaise: Math.round(15 + 15 + 95.8), marginPaise: 135 - 126, messages: 4 })
  })

  it('lists months oldest first across a year end', () => {
    expect(monthsEnding('2027-02', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('reports: roles, parameters and CSV', () => {
  const data: ReportData = {
    accounts: ACCOUNTS.filter((a) => a.inMetrics),
    renewals: [],
    invoices: INVOICES,
    ledger: [],
    managedOrgs: new Set(),
    costPerMessage: { utility: 15 },
    staff: [{ id: 's1', name: 'Asha' }, { id: 's2', name: 'Ravi' }],
    excluded: 1,
  }

  it('shows Admin everything, Sales the funnel and their own numbers, Accounts the money', () => {
    expect(sectionsFor('admin').sections).toEqual(['funnel', 'money', 'team', 'marketing'])
    expect(sectionsFor('sales')).toEqual({ sections: ['funnel', 'team'], ownTeamOnly: true })
    expect(sectionsFor('accounts').sections).toEqual(['money'])
    const params = parseReportParams({}, NOW)
    const sales = buildReport(data, params, { role: 'sales', staffId: 's2' }, NOW)
    expect(sales.money).toBeUndefined()
    expect(sales.marketing).toBeUndefined()
    expect(sales.team?.map((r) => r.staffId)).toEqual(['s2'])
    const accounts = buildReport(data, params, { role: 'accounts', staffId: 'x' }, NOW)
    expect(Object.keys(accounts)).toEqual(['money'])
  })

  it('falls back to safe parameters for unknown or future values', () => {
    expect(parseReportParams({ period: 'forever', month: '2099-01', group: 'x' }, NOW)).toEqual({ period: '90d', month: '2026-10', group: 'source' })
    expect(parseReportParams({ period: '30d', month: '2026-08', group: 'campaign' }, NOW)).toEqual({ period: '30d', month: '2026-08', group: 'campaign' })
  })

  it('writes formula-safe CSV for each section a role can see', () => {
    const params = parseReportParams({ month: '2026-10' }, NOW)
    const admin = buildReport({ ...data, accounts: [...data.accounts, account('evil', { name: '=HYPERLINK("x")', createdAt: ago(1) })] }, params, { role: 'admin', staffId: 's1' }, NOW)
    const funnel = reportCsv('funnel', admin, params)!
    expect(funnel.startsWith('﻿')).toBe(true)
    expect(funnel.match(/﻿/g)).toHaveLength(1)
    expect(funnel).toContain("'=HYPERLINK")
    const money = reportCsv('money', admin, params)!
    expect(money).toContain('New MRR in 2026-10,2000.00,1')
    expect(money).toContain('Churned MRR in 2026-10,800.00,1')
    expect(reportCsv('team', admin, params)).toContain('Asha')
    expect(reportCsv('money', buildReport(data, params, { role: 'sales', staffId: 's1' }, NOW), params)).toBeNull()
  })
})
