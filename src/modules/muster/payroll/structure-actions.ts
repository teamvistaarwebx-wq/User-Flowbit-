'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { withTransaction } from '@/lib/db'
import { addDays, formatDate } from '@/lib/dates'
import { NotFoundError, UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { isoDate, objectId, optionalText, paise } from '@/lib/validation'
import { Employee } from '@/models/muster/Employee'
import { SalaryComponent } from '@/models/muster/SalaryComponent'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { OWN_RECORD_REFUSAL } from '@/modules/muster/leave/approvals'
import { mayDecideOwn, ownEmployeeId } from '@/modules/muster/people/scope'
import { CALCULATION_TYPES, percentageLooksWrong } from './components'
import { MAX_ANNUAL_CTC_PAISE, MAX_MONTHLY_GROSS_PAISE, previewStructure, revisionStartProblem } from './structure-lines'

const lineSchema = z.object({
  code: z.string().trim().toUpperCase().min(1),
  calculationType: z.enum(CALCULATION_TYPES),
  /** Rupees for fixed (converted to paise below), a percentage otherwise. */
  value: z.coerce.number({ error: 'Enter a number' }).min(0, 'Use zero or more'),
})

const structureSchema = z.object({
  employeeId: objectId,
  effectiveFrom: isoDate,
  monthlyGross: paise,
  ctcAnnual: paise.optional(),
  notes: optionalText(500),
  lines: z.array(lineSchema).min(1, 'Add at least one component'),
})

export const saveSalaryStructure = action(
  structureSchema,
  async (input, ctx) => {
    if (input.employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const employee = await ctx.db(Employee).findById(input.employeeId, { fullName: 1 }).lean()
    if (!employee) throw new NotFoundError('That employee')
    if (input.monthlyGross <= 0 || input.monthlyGross >= MAX_MONTHLY_GROSS_PAISE) return fail('Some fields need attention.', { monthlyGross: 'Enter a monthly gross above zero and under ₹1 crore' })
    const ctcAnnual = input.ctcAnnual && input.ctcAnnual > 0 ? input.ctcAnnual : input.monthlyGross * 12
    if (ctcAnnual >= MAX_ANNUAL_CTC_PAISE) return fail('Some fields need attention.', { ctcAnnual: 'Annual CTC must be under ₹15 crore' })
    const lineErrors: Record<string, string> = {}
    input.lines.forEach((l, i) => {
      if (percentageLooksWrong(l.calculationType, l.value)) lineErrors[`lines.${i}.value`] = 'A percentage cannot be above 100. Did you mean a fixed amount?'
    })
    if (Object.keys(lineErrors).length) return fail('Some fields need attention.', lineErrors)

    const components = new Map((await ctx.db(SalaryComponent).find({ isActive: true }).lean()).map((c) => [c.code, c]))
    const unknown = input.lines.find((l) => !components.has(l.code))
    if (unknown) return fail(`${unknown.code} is not an active salary component. Add it under Components first.`)
    const lines = input.lines.map((l) => ({ code: l.code, calculationType: l.calculationType, value: l.calculationType === 'fixed' ? Math.round(l.value * 100) : l.value, componentId: components.get(l.code)?._id }))
    const { amounts, gap } = previewStructure(input.monthlyGross, ctcAnnual, lines, components)

    await withTransaction(async (session) => {
      const current = await ctx.db(SalaryStructure).findOne({ employeeId: input.employeeId, effectiveTo: null }, null, { session }).lean()
      const problem = revisionStartProblem(input.effectiveFrom, current?.effectiveFrom ?? null)
      if (problem) throw new UserError(problem, { effectiveFrom: problem })
      if (current) await ctx.db(SalaryStructure).updateOne({ _id: current._id }, { $set: { effectiveTo: addDays(input.effectiveFrom, -1) } }, { session })
      await ctx.db(SalaryStructure).create(
        { employeeId: input.employeeId, effectiveFrom: input.effectiveFrom, effectiveTo: null, monthlyGross: input.monthlyGross, ctcAnnual, notes: input.notes, createdBy: ctx.userId, lines: lines.map((l) => ({ ...l, monthlyAmount: amounts.get(l.code) ?? 0 })) },
        { session },
      )
    })
    await audit(ctx, { action: 'salary.structure_saved', entity: 'Employee', entityId: input.employeeId, summary: `Salary structure saved for ${employee.fullName} from ${formatDate(input.effectiveFrom)}: ${formatINR(input.monthlyGross)} a month`, product: 'muster', meta: { ctcAnnual } })
    revalidatePath('/app/hr/payroll/structures')
    const warn = gap !== 0 ? ` The components are ${formatINR(Math.abs(gap))} ${gap > 0 ? 'short of' : 'over'} the gross; adjust the Special Allowance to close the gap.` : ''
    return ok(`Salary structure saved for ${employee.fullName}, from ${formatDate(input.effectiveFrom)}.${warn} If pay changed, draft a Salary Revision letter.`)
  },
  { product: 'muster', feature: 'muster.payroll', perm: 'people.salary' },
)
