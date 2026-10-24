import { isoDateIST } from '@/lib/dates'
import type { StaffRole } from '@/lib/console/roles'
import { funnelReport, MARKETING_GROUPS, marketingReport, teamReport, type FunnelReport, type MarketingGroup, type MarketingRow, type Period, type TeamRow } from './funnel'
import { collectionsByMonth, monthsEnding, mrrMovement, overdueBills, renewalsDue, tdsPending, walletMonths, type CollectionMonth, type MrrMovement, type RenewalAccount, type WalletMonth } from './money'
import type { ReportData } from './query'

/**
 * Console reports: the parameters, who may see which section (console spec
 * 7.2: Admin all; Sales the funnel and their own numbers; Accounts the
 * money), and the sections built from ./query's data. Pure.
 */

export const REPORT_SECTIONS = ['funnel', 'money', 'team', 'marketing'] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]
export const SECTION_LABEL: Record<ReportSection, string> = { funnel: 'Funnel', money: 'Money', team: 'Team', marketing: 'Marketing' }

export const PERIODS = ['30d', '90d', '365d', 'all'] as const
export type PeriodKey = (typeof PERIODS)[number]
export const PERIOD_LABEL: Record<PeriodKey, string> = { '30d': '30 days', '90d': '90 days', '365d': '12 months', all: 'All time' }
const PERIOD_DAYS: Record<PeriodKey, number | null> = { '30d': 30, '90d': 90, '365d': 365, all: null }

export type ReportParams = Readonly<{ period: PeriodKey; month: string; group: MarketingGroup }>

/** What a role sees: Admin everything; Sales the funnel and only its own Team row; Accounts the money. */
export function sectionsFor(role: StaffRole): { sections: ReportSection[]; ownTeamOnly: boolean } {
  if (role === 'admin') return { sections: [...REPORT_SECTIONS], ownTeamOnly: false }
  if (role === 'sales') return { sections: ['funnel', 'team'], ownTeamOnly: true }
  return { sections: ['money'], ownTeamOnly: false }
}

const isMonth = (v: string | undefined): v is string => Boolean(v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v))

/** Parameters from the query string; anything unknown, or a future month, falls back to the default. */
export function parseReportParams(sp: Readonly<Record<string, string | undefined>>, now: Date): ReportParams {
  const current = isoDateIST(now).slice(0, 7)
  const month = isMonth(sp.month) && sp.month <= current ? sp.month : current
  const period = (PERIODS as readonly string[]).includes(sp.period ?? '') ? (sp.period as PeriodKey) : '90d'
  const group = (MARKETING_GROUPS as readonly string[]).includes(sp.group ?? '') ? (sp.group as MarketingGroup) : 'source'
  return { period, month, group }
}

export function periodOf(key: PeriodKey, now: Date): Period {
  const days = PERIOD_DAYS[key]
  return { from: days == null ? null : new Date(now.getTime() - days * 86_400_000), to: now }
}

export type MoneyReport = Readonly<{
  mrrPaise: number
  arrPaise: number
  month: string
  movement: MrrMovement
  renewals: { rows: RenewalAccount[]; paise: number }
  overdueBills: { count: number; paise: number }
  pastDue: { count: number; paise: number }
  tds: { count: number; paise: number }
  collections: CollectionMonth[]
  wallet: WalletMonth[]
}>

/** Months of collections and wallet history shown (ending with the chosen month). */
export const HISTORY_MONTHS = 12

export function moneyReport(data: ReportData, month: string, now: Date): MoneyReport {
  const today = isoDateIST(now)
  const mrrPaise = data.accounts.filter((a) => !a.deleted).reduce((s, a) => s + a.mrrPaise, 0)
  const months = monthsEnding(month, HISTORY_MONTHS)
  const late = data.renewals.filter((r) => r.paid && r.periodEnd && r.periodEnd.getTime() < now.getTime())
  return {
    mrrPaise,
    arrPaise: mrrPaise * 12,
    month,
    movement: mrrMovement(data.invoices, month, today),
    renewals: renewalsDue(data.renewals, now),
    overdueBills: overdueBills(data.invoices, today),
    pastDue: { count: late.length, paise: late.reduce((s, r) => s + r.amountPaise, 0) },
    tds: tdsPending(data.invoices),
    collections: collectionsByMonth(data.invoices, months),
    wallet: walletMonths(data.ledger, months, data.managedOrgs, data.costPerMessage),
  }
}

export type BuiltReport = Readonly<{
  funnel?: FunnelReport
  money?: MoneyReport
  team?: TeamRow[]
  marketing?: MarketingRow[]
}>

/** Only the sections the role may see are computed at all. */
export function buildReport(data: ReportData, params: ReportParams, viewer: { role: StaffRole; staffId: string }, now: Date): BuiltReport {
  const { sections, ownTeamOnly } = sectionsFor(viewer.role)
  const period = periodOf(params.period, now)
  return {
    ...(sections.includes('funnel') ? { funnel: funnelReport(data.accounts, period, now) } : {}),
    ...(sections.includes('money') ? { money: moneyReport(data, params.month, now) } : {}),
    ...(sections.includes('team') ? { team: teamReport(data.accounts, data.staff, period, ownTeamOnly ? viewer.staffId : undefined) } : {}),
    ...(sections.includes('marketing') ? { marketing: marketingReport(data.accounts, period, params.group) } : {}),
  }
}
