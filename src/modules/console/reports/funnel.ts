import type { AccountType } from '@/lib/account-types'
import type { HealthScore } from '@/modules/console/health'

/**
 * Console reports → Funnel, Team and Marketing (console spec 7.2): pure
 * maths over one row per workspace (./query loads them). Internal and Test
 * workspaces never reach these functions: the query leaves them out, and
 * `cohort` drops any that slip through.
 */

export type ReportAccount = Readonly<{
  id: string
  name: string
  createdAt: Date
  accountType: AccountType
  /** False for Internal and Test. */
  inMetrics: boolean
  /** The workspace's data was deleted (a tombstone): counted in history, never listed as stalled. */
  deleted: boolean
  /** How it started: a 6-month Free plan or a 15-day trial. */
  signupType: 'free' | 'trial'
  setupStarted: boolean
  imported: boolean
  health: HealthScore | null
  /** First paid Flowbit invoice for a plan (not a wallet recharge, not a test payment). */
  paidAt: Date | null
  mrrPaise: number
  salespersonId: string | null
  /** lib/utm utmSourceLabel of the signup ('Direct' without one). */
  utmSource: string
  utmMedium: string | null
  utmCampaign: string | null
}>

export const FUNNEL_STEPS = ['signup', 'started', 'setup', 'habit', 'paid'] as const
export type FunnelStep = (typeof FUNNEL_STEPS)[number]

export const FUNNEL_LABEL: Record<FunnelStep, string> = {
  signup: 'Signed up',
  started: 'On Free or Trial',
  setup: 'In setup',
  habit: 'Habit formed',
  paid: 'Paid',
}

const STALL_HINT: Record<'started' | 'setup' | 'habit', string> = {
  started: 'On Free or Trial, no setup or import yet',
  setup: 'Set up, not yet a habit',
  habit: 'A habit, not yet paying',
}

export type Period = Readonly<{ from: Date | null; to: Date }>

/** The accounts a report counts: in metrics, signed up inside the period. */
export const cohort = (accounts: readonly ReportAccount[], period: Period): ReportAccount[] =>
  accounts.filter((a) => a.inMetrics && a.createdAt.getTime() <= period.to.getTime() && (!period.from || a.createdAt.getTime() >= period.from.getTime()))

/**
 * The furthest step an account reached. Each step counts accounts that
 * reached it or a later one, so the funnel never grows: a customer who paid
 * without a setup still counts as set up. Every signup starts on Free or a
 * trial, so "started" always equals "signed up"; the report shows the split.
 */
export function furthestStep(a: ReportAccount): FunnelStep {
  if (a.paidAt || a.accountType === 'paid') return 'paid'
  if (a.health === 'green') return 'habit'
  if (a.setupStarted || a.imported) return 'setup'
  return 'started'
}

export type FunnelRow = Readonly<{ step: FunnelStep; label: string; count: number; fromPrevious: number | null; fromSignup: number | null }>
export type StalledAccount = Readonly<{ id: string; name: string; step: FunnelStep; days: number }>
export type FunnelReport = Readonly<{
  rows: FunnelRow[]
  split: { free: number; trial: number }
  /** Where accounts that have not paid stopped, with the reason in words. */
  stalls: { step: FunnelStep; label: string; hint: string; count: number }[]
  /** The longest-waiting live accounts at each stall point (for "who to call"). */
  stalled: StalledAccount[]
}>

const DAY_MS = 86_400_000
const rate = (part: number, whole: number): number | null => (whole ? Math.round((part / whole) * 1000) / 10 : null)

export function funnelReport(accounts: readonly ReportAccount[], period: Period, now: Date, listLimit = 25): FunnelReport {
  const rows = cohort(accounts, period)
  const reached = (step: FunnelStep) => rows.filter((a) => FUNNEL_STEPS.indexOf(furthestStep(a)) >= FUNNEL_STEPS.indexOf(step)).length
  const counts = FUNNEL_STEPS.map((step) => reached(step))
  const funnel = FUNNEL_STEPS.map((step, i) => ({ step, label: FUNNEL_LABEL[step], count: counts[i], fromPrevious: i ? rate(counts[i], counts[i - 1]) : null, fromSignup: i ? rate(counts[i], counts[0]) : null }))
  const open = rows.filter((a) => furthestStep(a) !== 'paid')
  const stalls = (['started', 'setup', 'habit'] as const).map((step) => ({ step, label: FUNNEL_LABEL[step], hint: STALL_HINT[step], count: open.filter((a) => furthestStep(a) === step).length }))
  const stalled = open
    .filter((a) => !a.deleted)
    .map((a) => ({ id: a.id, name: a.name, step: furthestStep(a), days: Math.floor((now.getTime() - a.createdAt.getTime()) / DAY_MS) }))
    .sort((x, y) => y.days - x.days)
    .slice(0, listLimit)
  return {
    rows: funnel,
    split: { free: rows.filter((a) => a.signupType === 'free').length, trial: rows.filter((a) => a.signupType === 'trial').length },
    stalls,
    stalled,
  }
}

// ---------------------------------------------------------------------------
// Team: numbers per salesperson
// ---------------------------------------------------------------------------

export type TeamRow = Readonly<{
  staffId: string | null
  name: string
  accounts: number
  free: number
  trial: number
  paid: number
  habit: number
  signups: number
  conversions: number
  conversionRate: number | null
  mrrPaise: number
}>

const inPeriod = (date: Date | null, period: Period) => Boolean(date && date.getTime() <= period.to.getTime() && (!period.from || date.getTime() >= period.from.getTime()))

/**
 * One row per salesperson (and "Unassigned"): the accounts they hold now by
 * type, signups and first payments inside the period, conversion (first
 * payments / signups in the period) and the MRR they look after. `only`
 * restricts it to one person (a Sales member sees their own row).
 */
export function teamReport(accounts: readonly ReportAccount[], staff: readonly { id: string; name: string }[], period: Period, only?: string): TeamRow[] {
  const live = accounts.filter((a) => a.inMetrics && !a.deleted)
  const people = [...staff.map((s) => ({ staffId: s.id as string | null, name: s.name })), { staffId: null, name: 'Unassigned' }]
  return people
    .filter((p) => (only ? p.staffId === only : true))
    .map((p) => {
      const mine = live.filter((a) => a.salespersonId === p.staffId)
      const signups = mine.filter((a) => inPeriod(a.createdAt, period)).length
      const conversions = mine.filter((a) => inPeriod(a.paidAt, period)).length
      return {
        staffId: p.staffId,
        name: p.name,
        accounts: mine.length,
        free: mine.filter((a) => a.accountType === 'free').length,
        trial: mine.filter((a) => a.accountType === 'trial').length,
        paid: mine.filter((a) => a.accountType === 'paid' || a.accountType === 'comped').length,
        habit: mine.filter((a) => a.health === 'green').length,
        signups,
        conversions,
        conversionRate: rate(conversions, signups),
        mrrPaise: mine.reduce((sum, a) => sum + a.mrrPaise, 0),
      }
    })
    .filter((r) => only || r.accounts > 0 || r.staffId !== null)
}

// ---------------------------------------------------------------------------
// Marketing: where signups came from
// ---------------------------------------------------------------------------

export const MARKETING_GROUPS = ['source', 'medium', 'campaign'] as const
export type MarketingGroup = (typeof MARKETING_GROUPS)[number]

export type MarketingRow = Readonly<{ key: string; signups: number; free: number; trial: number; paid: number; conversionRate: number | null; mrrPaise: number }>

const groupKey = (a: ReportAccount, by: MarketingGroup): string => (by === 'source' ? a.utmSource : by === 'medium' ? (a.utmMedium ?? '(none)') : (a.utmCampaign ?? '(none)'))

/** Signups in the period by first-touch UTM source, medium or campaign, with how many went on to pay. */
export function marketingReport(accounts: readonly ReportAccount[], period: Period, by: MarketingGroup): MarketingRow[] {
  const rows = cohort(accounts, period)
  const keys = [...new Set(rows.map((a) => groupKey(a, by)))]
  return keys
    .map((key) => {
      const group = rows.filter((a) => groupKey(a, by) === key)
      const paid = group.filter((a) => furthestStep(a) === 'paid').length
      return {
        key,
        signups: group.length,
        free: group.filter((a) => a.signupType === 'free').length,
        trial: group.filter((a) => a.signupType === 'trial').length,
        paid,
        conversionRate: rate(paid, group.length),
        mrrPaise: group.reduce((sum, a) => sum + a.mrrPaise, 0),
      }
    })
    .sort((x, y) => y.signups - x.signups || x.key.localeCompare(y.key))
}
