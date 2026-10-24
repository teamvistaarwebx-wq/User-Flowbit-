import type { z } from 'zod'

/**
 * Plain-language text for a statutory rates validation issue (R2 15.3):
 * "Employee PF rate must be 25% or less" instead of
 * "pf.employeeRatePercent — Number must be less than or equal to 25".
 */

type Unit = 'percent' | 'rupees' | 'plain'
type Field = { label: string; unit: Unit }

const FIELDS: Record<string, Field> = {
  pf: { label: 'PF settings', unit: 'plain' },
  esi: { label: 'ESI settings', unit: 'plain' },
  tds: { label: 'TDS settings', unit: 'plain' },
  pt: { label: 'Professional tax schedules', unit: 'plain' },
  lwf: { label: 'LWF schedules', unit: 'plain' },
  'pf.enabled': { label: 'PF on or off', unit: 'plain' },
  'pf.employeeRatePercent': { label: 'Employee PF rate', unit: 'percent' },
  'pf.employerRatePercent': { label: 'Employer PF rate', unit: 'percent' },
  'pf.wageCeiling': { label: 'PF wage ceiling', unit: 'rupees' },
  'pf.applyCeiling': { label: 'Apply the PF ceiling', unit: 'plain' },
  'pf.prorateCeiling': { label: 'Prorate the PF ceiling', unit: 'plain' },
  'esi.enabled': { label: 'ESI on or off', unit: 'plain' },
  'esi.employeeRatePercent': { label: 'Employee ESI rate', unit: 'percent' },
  'esi.employerRatePercent': { label: 'Employer ESI rate', unit: 'percent' },
  'esi.grossEligibilityLimit': { label: 'ESI gross limit', unit: 'rupees' },
  'tds.enabled': { label: 'TDS on or off', unit: 'plain' },
  'tds.mode': { label: 'TDS mode', unit: 'plain' },
  'pt.state': { label: 'state', unit: 'plain' },
  'pt.enabled': { label: 'on or off', unit: 'plain' },
  'pt.slabs': { label: 'slabs', unit: 'plain' },
  'pt.slabs.upTo': { label: 'upper limit', unit: 'rupees' },
  'pt.slabs.amount': { label: 'amount', unit: 'rupees' },
  'pt.monthOverrides.month': { label: 'month', unit: 'plain' },
  'pt.monthOverrides.amount': { label: 'amount', unit: 'rupees' },
  'lwf.state': { label: 'state', unit: 'plain' },
  'lwf.enabled': { label: 'on or off', unit: 'plain' },
  'lwf.employeeAmount': { label: 'employee amount', unit: 'rupees' },
  'lwf.employerAmount': { label: 'employer amount', unit: 'rupees' },
  'lwf.remittanceMonths': { label: 'remittance month', unit: 'plain' },
}

const SCHEDULE_NAME: Record<string, string> = { pt: 'Professional tax', lwf: 'LWF' }
const ROW_NAME: Record<string, string> = { slabs: 'slab', monthOverrides: 'month override' }

type Path = readonly PropertyKey[]

const stateAt = (input: unknown, section: string, index: number): string | null => {
  const rows = (input as Record<string, unknown> | null)?.[section]
  const state = Array.isArray(rows) ? (rows[index] as { state?: unknown } | undefined)?.state : undefined
  return typeof state === 'string' && state.trim() ? state.trim().toUpperCase() : null
}

/** The field's label, with the PT or LWF schedule ("Professional tax (MP) slab 2 amount"). */
export function statutoryFieldLabel(path: Path, input?: unknown): { label: string; unit: Unit } {
  const keys = path.filter((p): p is string => typeof p === 'string')
  const field = FIELDS[keys.join('.')] ?? { label: 'a rate', unit: 'plain' as const }
  const [section, schedule, row, rowIndex] = path
  if (typeof section !== 'string' || !SCHEDULE_NAME[section] || typeof schedule !== 'number') return field
  // A bad state code is the problem itself, so it is not used to name the schedule.
  const state = keys[keys.length - 1] === 'state' ? null : stateAt(input, section, schedule)
  const head = `${SCHEDULE_NAME[section]}${state ? ` (${state})` : ` schedule ${schedule + 1}`}`
  const rowPart = typeof row === 'string' && ROW_NAME[row] && typeof rowIndex === 'number' ? ` ${ROW_NAME[row]} ${rowIndex + 1}` : ''
  return { label: `${head}${rowPart} ${field.label}`, unit: field.unit }
}

const formatLimit = (value: number | bigint, unit: Unit) => {
  const n = Number(value)
  if (unit === 'percent') return `${n}%`
  if (unit === 'rupees') return `₹${n.toLocaleString('en-IN')}`
  return n.toLocaleString('en-IN')
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** One sentence for the first problem in the rates, for the form's error toast. */
export function statutoryIssueMessage(issue: z.core.$ZodIssue, input?: unknown): string {
  const { label, unit } = statutoryFieldLabel(issue.path, input)
  const name = capitalise(label)
  if (issue.code === 'too_big' && issue.origin === 'number') return `${name} must be ${formatLimit(issue.maximum, unit)} or less.`
  if (issue.code === 'too_small' && issue.origin === 'number') return `${name} must be ${formatLimit(issue.minimum, unit)} or more.`
  if ((issue.code === 'too_big' || issue.code === 'too_small') && issue.origin === 'string') return `${name} must be a two-letter state code.`
  if (issue.code === 'too_small' && issue.origin === 'array') return `${name}: add at least one.`
  if (issue.code === 'invalid_type') return `${name} is missing or not a valid value.`
  return `Check ${label}.`
}
