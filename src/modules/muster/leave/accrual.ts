/**
 * Leave accrual (pure). One rule, tested:
 * - Only full-time people who are active, confirmed, serving notice or resigned accrue
 *   (probation, interns and contract staff do not).
 * - `monthly`: a month is credited once its 1st has arrived; the join month
 *   counts when they joined on or before the 15th; credits stop after exit.
 * - `annual`: quota × eligible months / 12, granted up front, rounded to a half day.
 * - `service_year`: completed service years × quota, capped by carry-forward cap.
 * - `on_application`: no balance; granted up to the quota per request.
 */

export const ACCRUAL_MODELS = ['monthly', 'annual', 'service_year', 'on_application'] as const
export type AccrualModel = (typeof ACCRUAL_MODELS)[number]
export const ACCRUAL_LABEL: Record<AccrualModel, string> = { monthly: 'Monthly', annual: 'Yearly, up front', service_year: 'Per service year', on_application: 'On application' }

export type LeaveYear = { start: string; end: string; label: string }

const pad = (n: number) => String(n).padStart(2, '0')
const r2 = (n: number) => Math.round(n * 100) / 100
const toHalf = (n: number) => Math.round(n * 2) / 2

/** The leave year containing `asOf`, starting in `startMonth` (1–12). */
export function leaveYearFor(asOf: string, startMonth: number): LeaveYear {
  const [y, m] = asOf.split('-').map(Number)
  const startYear = m >= startMonth ? y : y - 1
  const start = `${startYear}-${pad(startMonth)}-01`
  const endMonth = startMonth === 1 ? 12 : startMonth - 1
  const endYear = startMonth === 1 ? startYear : startYear + 1
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate()
  const label = startMonth === 1 ? String(startYear) : `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
  return { start, end: `${endYear}-${pad(endMonth)}-${pad(lastDay)}`, label }
}

export const previousLeaveYear = (year: LeaveYear, startMonth: number) => {
  const [y] = year.start.split('-').map(Number)
  return leaveYearFor(`${y - 1}-${pad(startMonth)}-01`, startMonth)
}

const ACCRUING_STATUSES = new Set(['active', 'confirmed', 'notice_period', 'resigned'])
export const accruesLeave = (p: { employmentType: string; status: string }) => p.employmentType === 'full_time' && ACCRUING_STATUSES.has(p.status)

/** First day of the first month that earns leave. */
export function firstEarnedMonth(joinDate: string): string {
  const [y, m, d] = joinDate.split('-').map(Number)
  if (d <= 15) return `${y}-${pad(m)}-01`
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
}

/** 1st-of-month dates from `from` to `to` inclusive. */
function monthStarts(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  for (;;) {
    const first = `${y}-${pad(m)}-01`
    if (first > to) break
    out.push(first)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/** Months credited in the leave year up to `asOf` (exclusive of months after an exit). */
export function earnedMonths(year: LeaveYear, joinDate: string, asOf: string, exitDate?: string | null): number {
  const from = [year.start, firstEarnedMonth(joinDate)].sort().at(-1)!
  const until = [year.end, asOf, exitDate ?? '9999-12-31'].sort()[0]
  return monthStarts(from, until).length
}

export function completedServiceYears(joinDate: string, asOf: string): number {
  const [jy, jm, jd] = joinDate.split('-').map(Number)
  const [ay, am, ad] = asOf.split('-').map(Number)
  let years = ay - jy
  if (am < jm || (am === jm && ad < jd)) years -= 1
  return Math.max(0, years)
}

export type LeaveTypeRule = { accrualModel: AccrualModel; annualQuota: number; accrualPerMonth: number; carryForwardCap: number | null }
export type Person = { employmentType: string; status: string; joinDate: string; exitDate?: string | null }

/** Days accrued in the leave year as of `asOf`. */
export function accruedDays(type: LeaveTypeRule, person: Person, year: LeaveYear, asOf: string): number {
  if (type.accrualModel === 'on_application' || !accruesLeave(person)) return 0
  if (type.accrualModel === 'monthly') return r2(earnedMonths(year, person.joinDate, asOf, person.exitDate) * type.accrualPerMonth)
  if (type.accrualModel === 'annual') {
    const months = earnedMonths(year, person.joinDate, year.end, person.exitDate)
    return toHalf((type.annualQuota * months) / 12)
  }
  const years = completedServiceYears(person.joinDate, [asOf, person.exitDate ?? '9999-12-31'].sort()[0])
  const total = years * type.annualQuota
  return type.carryForwardCap == null ? total : Math.min(total, type.carryForwardCap)
}

/** What carries into the next year: a percentage of a positive balance, rounded to a half day, capped. */
export function carryForward(balance: number, percent: number, cap: number | null): number {
  if (balance <= 0 || cap === 0) return 0
  const carried = toHalf((balance * percent) / 100)
  return cap == null ? carried : Math.min(carried, cap)
}

/** Opening balance after replaying earlier years (oldest first): each year's closing (with HR's adjustments) carries forward. */
export function openingBalance(priorYears: readonly { accrued: number; taken: number; adjusted?: number }[], percent: number, cap: number | null): number {
  return priorYears.reduce((opening, y) => carryForward(opening + y.accrued + (y.adjusted ?? 0) - y.taken, percent, cap), 0)
}
