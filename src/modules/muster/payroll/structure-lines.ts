import type { Types } from 'mongoose'
import { formatDate } from '@/lib/dates'
import { STANDARD_COMPONENTS, type CalculationType, type ComponentType } from './components'
import { resolveStructure, type ComponentDefinition, type StructureLineInput } from './engine'
import { percentOf } from './money'

/** Salary structure lines ↔ engine input (pure, client-safe). */

export type StoredLine = { code: string; calculationType: CalculationType; value: number; componentId?: Types.ObjectId | string | null }

export type ComponentLike = {
  code: string
  name: string
  componentType: ComponentType | string
  calculationType?: CalculationType | string
  defaultValue?: number
  countsForPf?: boolean | null
  countsForEsi?: boolean | null
  countsForWages?: boolean | null
  prorateOnLop?: boolean | null
  displayOrder?: number | null
}

export const MAX_MONTHLY_GROSS_PAISE = 1_00_00_000_00
export const MAX_ANNUAL_CTC_PAISE = 15_00_00_000_00

const STANDARD_BY_CODE = new Map(STANDARD_COMPONENTS.map((c) => [c.code, c]))

export function toDefinition(code: string, component?: ComponentLike): ComponentDefinition {
  const c = component ?? STANDARD_BY_CODE.get(code)
  return {
    code,
    name: c?.name ?? code,
    componentType: (c?.componentType as ComponentType) ?? 'earning',
    countsForPf: Boolean(c?.countsForPf),
    countsForEsi: Boolean(c?.countsForEsi),
    prorateOnLop: c?.prorateOnLop ?? true,
    displayOrder: c?.displayOrder ?? 100,
  }
}

/** Stored lines → engine lines, using the workspace's component flags (by code). */
export const engineLines = (lines: readonly StoredLine[], components: ReadonlyMap<string, ComponentLike>): StructureLineInput[] =>
  lines.map((l) => ({ component: toDefinition(l.code, components.get(l.code)), calculationType: l.calculationType, value: l.value }))

/** The default split: BASIC 50% of gross, HRA 40% of basic, SPECIAL = the remainder (fixed). */
export function defaultLines(monthlyGross: number): StoredLine[] {
  const basic = percentOf(monthlyGross, 50)
  const hra = percentOf(basic, 40)
  return [
    { code: 'BASIC', calculationType: 'percent_of_gross', value: 50 },
    { code: 'HRA', calculationType: 'percent_of_basic', value: 40 },
    { code: 'SPECIAL', calculationType: 'fixed', value: Math.max(0, monthlyGross - basic - hra) },
  ]
}

/** Full-month amount per line (paise) and the gap to the monthly gross, for the editor preview and storage. */
export function previewStructure(monthlyGross: number, ctcAnnual: number, lines: readonly StoredLine[], components: ReadonlyMap<string, ComponentLike>) {
  const amounts = resolveStructure(monthlyGross, ctcAnnual, engineLines(lines, components))
  const total = [...amounts.values()].reduce((a, b) => a + b, 0)
  return { amounts, total, gap: monthlyGross - total }
}

/** Monthly gross for a year's CTC when only one is given. */
export const defaultCtc = (monthlyGross: number): number => monthlyGross * 12

/** The day a revision may start: after the current structure began, and a real date. */
export function revisionStartProblem(effectiveFrom: string, currentStart: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`))) return 'Use a real date.'
  if (currentStart && effectiveFrom <= currentStart) return `The current structure began on ${formatDate(currentStart)}. A revision has to start after that.`
  return null
}
