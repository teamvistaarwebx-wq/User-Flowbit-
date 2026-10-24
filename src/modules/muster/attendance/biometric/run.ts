import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { IMPORT_COLUMNS, importSummary } from '../import'
import { attendanceScope, checkWithScope, type AttendanceCheck } from '../import-run'
import { FORMAT_LABELS } from './formats'
import type { BiometricPreview, BiometricPreviewRow } from './types'
import { daysToRows, deviceResolver, type UnmappedDevice } from './mapping'
import { buildDays, type PunchDay } from './punches'
import { readPunchFile, type PunchFileInput } from './read'

/** Biometric import: punches → days → the attendance import's checks (server-only). */

/** Person-days a single import may write (one transaction). */
export const MAX_BIOMETRIC_DAYS = 15_000
const SKIPPED_SHOWN = 20

export type BiometricInput = PunchFileInput & { cutoff?: string }

export type { BiometricPreview, BiometricPreviewRow }

export type BiometricCheck = { check: AttendanceCheck; preview: BiometricPreview }

function summaryOf(check: AttendanceCheck, punches: number, unmapped: readonly UnmappedDevice[], skipped: number): string {
  const parts = [`${punches.toLocaleString('en-IN')} punches read`, importSummary(check.rows).replace(/\.$/, '')]
  if (unmapped.length) parts.push(`${unmapped.length} device ${unmapped.length === 1 ? 'id is' : 'ids are'} not mapped to anyone yet`)
  if (skipped) parts.push(`${skipped} unreadable ${skipped === 1 ? 'line' : 'lines'} left out`)
  return `${parts.join('; ')}.`
}

function daysOf(punches: Parameters<typeof buildDays>[0], cutoff: string | undefined): PunchDay[] | string {
  try {
    return buildDays(punches, { cutoff })
  } catch (error) {
    return error instanceof Error ? error.message : 'The punches could not be grouped into days.'
  }
}

/** Reads the file, groups punches into days, maps device ids and runs every day through the attendance checks. Writes nothing. */
export async function checkBiometric(ctx: Ctx, input: BiometricInput): Promise<BiometricCheck | string> {
  const parsed = readPunchFile(input)
  if ('error' in parsed) return parsed.error
  if (!parsed.punches.length) return 'No punch could be read from the file. Check the columns, or pick them by hand.'
  const days = daysOf(parsed.punches, input.cutoff)
  if (typeof days === 'string') return days
  const scope = await attendanceScope(ctx)
  const { rows, unmapped, dayByLine } = daysToRows(days, deviceResolver(scope.employees))
  const check: AttendanceCheck | string = rows.length ? checkWithScope(ctx, scope, [...IMPORT_COLUMNS], rows, { maxRows: MAX_BIOMETRIC_DAYS, allowAfterMidnight: true }) : { rows: [], ignored: [], memberOf: new Map() }
  if (typeof check === 'string') return check.replace('rows', 'person-days')
  const merged = { ...check, rows: check.rows.map((r) => ({ ...r, warnings: [...(dayByLine.get(r.line)?.warnings ?? []), ...r.warnings] })) }
  const preview: BiometricPreview = {
    format: parsed.format,
    formatLabel: FORMAT_LABELS[parsed.format],
    headers: parsed.headers,
    columns: parsed.columns,
    summary: summaryOf(merged, parsed.punches.length, unmapped, parsed.skipped.length),
    punches: parsed.punches.length,
    days: days.length,
    ready: merged.rows.filter((r) => r.record).length,
    skipped: parsed.skipped.slice(0, SKIPPED_SHOWN),
    skippedCount: parsed.skipped.length,
    unmapped,
    rows: merged.rows.map((r) => {
      const day = dayByLine.get(r.line)
      return { line: r.line, code: r.code, name: r.name, date: r.date, status: r.status, in: day?.in ?? '', out: day?.out ?? null, punches: day?.punches ?? 0, errors: r.errors, warnings: r.warnings }
    }),
  }
  return { check: merged, preview }
}
