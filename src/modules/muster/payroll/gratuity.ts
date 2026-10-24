import { daysBetween } from '@/lib/dates'
import { addMonthsClamped, completedService } from '../people/tenure'

/**
 * Gratuity (pure). Commonly applied values, not a reading of the Act: a CA
 * confirms them. Money in paise; dates are 'YYYY-MM-DD'.
 */

export type GratuityRules = {
  minimumYears: number
  qualifyingDaysInFinalYear: number
  daysPerYear: number
  daysInMonth: number
  /** Part-years of more than this many months count as a full year. */
  roundUpAfterMonths: number
  ceilingPaise: number
}

export const DEFAULT_GRATUITY_RULES: GratuityRules = {
  minimumYears: 5,
  qualifyingDaysInFinalYear: 240,
  daysPerYear: 15,
  daysInMonth: 26,
  roundUpAfterMonths: 6,
  ceilingPaise: 20_00_000_00,
}

/** years, whole months past them, days past the last month mark, days since the last anniversary, total days. */
export type ServiceLength = { years: number; months: number; extraDays: number; daysSinceAnniversary: number; totalDays: number }

/** Exact completed service (see people/tenure for the month-end and leap-year rules). */
export function serviceLength(joined: string, until: string): ServiceLength {
  const s = completedService(joined, until)
  if (!s.totalDays) return { years: 0, months: 0, extraDays: 0, daysSinceAnniversary: 0, totalDays: 0 }
  return { years: s.years, months: s.months, extraDays: s.days, daysSinceAnniversary: daysBetween(anniversaryOn(joined, s.years), until), totalDays: s.totalDays }
}

export type GratuityResult = {
  isEligible: boolean
  qualifiedBy: 'completed_years' | '240_days' | 'death_or_disability' | null
  years: number
  service: ServiceLength
  amount: number
  isCapped: boolean
  qualifiesOn: string | null
}

/** The `years`-th anniversary (29 Feb joiners: 28 Feb in other years). */
const anniversaryOn = (joined: string, years: number): string => addMonthsClamped(joined, years * 12)

export function gratuityFor(
  input: { joined: string; until: string; monthlyWagePaise: number; endedByDeathOrDisability?: boolean },
  rules: GratuityRules = DEFAULT_GRATUITY_RULES,
): GratuityResult {
  const service = serviceLength(input.joined, input.until)
  const qualifiedBy: GratuityResult['qualifiedBy'] = input.endedByDeathOrDisability
    ? 'death_or_disability'
    : service.years >= rules.minimumYears
      ? 'completed_years'
      : service.years === rules.minimumYears - 1 && service.daysSinceAnniversary >= rules.qualifyingDaysInFinalYear
        ? '240_days'
        : null
  if (!qualifiedBy) {
    return { isEligible: false, qualifiedBy: null, years: 0, service, amount: 0, isCapped: false, qualifiesOn: anniversaryOn(input.joined, rules.minimumYears) }
  }
  // "More than six months" counts as a year: exactly six months does not.
  const overHalf = service.months > rules.roundUpAfterMonths || (service.months === rules.roundUpAfterMonths && service.extraDays > 0)
  const years = Math.max(1, service.years + (overHalf ? 1 : 0))
  const raw = Math.round((input.monthlyWagePaise / rules.daysInMonth) * rules.daysPerYear * years)
  const amount = Math.min(raw, rules.ceilingPaise)
  return { isEligible: true, qualifiedBy, years, service, amount, isCapped: amount < raw, qualifiesOn: null }
}

/**
 * Wage base for gratuity and overtime: the lines that count as wages, but at
 * least half of total pay (the Code on Social Security add-back).
 */
export function statutoryWageBase(lines: readonly { amount: number; countsForWages: boolean }[], thresholdPercent = 50): number {
  const total = lines.reduce((sum, l) => sum + l.amount, 0)
  if (total <= 0) return 0
  const counted = lines.filter((l) => l.countsForWages).reduce((sum, l) => sum + l.amount, 0)
  return Math.max(counted, Math.round((total * thresholdPercent) / 100))
}
