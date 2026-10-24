/**
 * Statutory versions over time (pure). A version has the legal date it took
 * effect (`effectiveFrom`, may fall mid-month) and the first payroll month it
 * applies to (`payrollFrom`, always the 1st).
 */

import { blockingSections } from './statutory'

export type DatedVersion = { effectiveFrom: string; payrollFrom: string; confirmedAt?: Date | string | null; createdAt?: Date | string | null }

const firstOfMonth = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01`

export const landsMidMonth = (date: string): boolean => date.slice(8, 10) !== '01'

const savedAt = (v: DatedVersion): number => (v.createdAt ? new Date(v.createdAt).getTime() : 0)

/**
 * The version payroll uses for a month: the latest whose payrollFrom is on or before the 1st. Versions are
 * never edited, so of two for the same payroll month the later-saved one is the correction and wins, confirmed
 * or not (unconfirmed, it blocks the month until it is confirmed).
 */
export function statutoryForMonth<T extends DatedVersion>(versions: readonly T[], year: number, month: number): T | null {
  const start = firstOfMonth(year, month)
  const applicable = [...versions].filter((v) => v.payrollFrom <= start).sort((a, b) => a.payrollFrom.localeCompare(b.payrollFrom) || savedAt(a) - savedAt(b) || a.effectiveFrom.localeCompare(b.effectiveFrom))
  return applicable.at(-1) ?? null
}

/** The version in force on a date by law (letters, reports); of two with the same legal date, the later-saved one. */
export function versionFor<T extends DatedVersion>(versions: readonly T[], date: string): T | null {
  const applicable = [...versions].filter((v) => v.effectiveFrom <= date).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || savedAt(a) - savedAt(b))
  return applicable.at(-1) ?? null
}

/** Versions that took effect inside the month but not on the 1st (shown as a mid-month callout). */
export function pendingTransitions<T extends DatedVersion>(versions: readonly T[], year: number, month: number): T[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return versions.filter((v) => v.effectiveFrom.startsWith(prefix) && landsMidMonth(v.effectiveFrom))
}

/**
 * Checks a proposed payroll month for a version: the 1st of a month, not
 * before the month the rates took effect, and at most 12 months after it.
 */
export function payrollMonthProblem(effectiveFrom: string, payrollFrom: string): string | null {
  if (!/^\d{4}-\d{2}-01$/.test(payrollFrom)) return 'Payroll applies rates from the 1st of a month.'
  if (payrollFrom.slice(0, 7) < effectiveFrom.slice(0, 7)) return 'Payroll cannot apply these rates before the month they took effect.'
  const [ey, em] = effectiveFrom.split('-').map(Number)
  const [py, pm] = payrollFrom.split('-').map(Number)
  if ((py - ey) * 12 + (pm - em) > 12) return 'Choose a payroll month within 12 months of the effective date.'
  return null
}

/**
 * Why payroll for the month cannot use the statutory rates, or null when it can. `unreadable` names the
 * sections of the version's settings that could not be read (`readStatutory`).
 */
export function statutoryBlock<T extends DatedVersion>(version: T | null, year: number, month: number, unreadable: readonly string[] = []): string | null {
  const label = `${year}-${String(month).padStart(2, '0')}`
  if (!version) return `No statutory rates are configured for ${label}. Add them in Salary structures → Statutory before generating this month.`
  const unread = blockingSections(unreadable)
  if (unread.length) return `The ${unread.join(' and ')} rates for ${label} — effective ${version.effectiveFrom} — could not be read, so payroll will not fill them in from defaults. Add corrected rates in Salary structures → Statutory and confirm them before generating this month.`
  if (!version.confirmedAt) return `The rates for ${label} — effective ${version.effectiveFrom} — have not been confirmed yet. Have them checked, then confirm them in Salary structures → Statutory.`
  return null
}
