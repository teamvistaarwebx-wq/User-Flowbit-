import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { Employee } from '@/models/muster/Employee'
import { DIRECTORY_STATUSES, statusLabelOf } from '@/modules/muster/people/lifecycle'
import { DEFAULT_GRATUITY_RULES, gratuityFor, statutoryWageBase, type GratuityResult } from '@/modules/muster/payroll/gratuity'
import { componentMap, currentStructures } from '@/modules/muster/payroll/queries'

export type GratuityRow = { id: string; code: string; name: string; status: string; serviceFrom: string; served: string; wageBase: number; result: GratuityResult }

/** Gratuity at today's salaries for everyone in the directory with a salary structure. */
export async function gratuityRows(ctx: Pick<Ctx, 'db'>): Promise<GratuityRow[]> {
  const today = todayIST()
  const people = await ctx.db(Employee).find({ deletedAt: null, status: { $in: DIRECTORY_STATUSES } }, { code: 1, fullName: 1, status: 1, joinDate: 1, originalJoiningDate: 1, exitDate: 1 }).sort({ joinDate: 1 }).lean()
  const [structures, components] = await Promise.all([currentStructures(ctx, people.map((p) => p._id)), componentMap(ctx)])
  return people.flatMap((p) => {
    const structure = structures.get(String(p._id))
    if (!structure) return []
    const wageBase = statutoryWageBase(structure.lines.map((l) => ({ amount: l.monthlyAmount ?? 0, countsForWages: Boolean(components.get(l.code)?.countsForWages) })))
    const serviceFrom = p.originalJoiningDate || p.joinDate
    const result = gratuityFor({ joined: serviceFrom, until: p.exitDate && p.exitDate < today ? p.exitDate : today, monthlyWagePaise: wageBase }, DEFAULT_GRATUITY_RULES)
    return [{ id: String(p._id), code: p.code, name: p.fullName, status: statusLabelOf(p.status), serviceFrom, served: `${result.service.years}y ${result.service.months}m`, wageBase, result }]
  })
}

/** Within a year of qualifying: 48+ months of service and not yet eligible. */
export const qualifyingSoon = (rows: readonly GratuityRow[]): GratuityRow[] => rows.filter((r) => !r.result.isEligible && r.result.service.years * 12 + r.result.service.months >= 48)
