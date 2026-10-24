import 'server-only'
import { isValidObjectId } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { Department } from '@/models/muster/Department'
import { Employee } from '@/models/muster/Employee'
import { Letter } from '@/models/muster/Letter'
import { LetterTemplate } from '@/models/muster/LetterTemplate'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { EMPLOYMENT_TYPE_LABEL, statusLabelOf, type EmploymentType } from '@/modules/muster/people/lifecycle'
import { companyProfileOf } from '@/lib/company-profile'
import { orgAddressLine } from '@/modules/muster/payroll/pdf-org'
import { BODIES } from './bodies'
import { LETTERS, LETTERS_BY_CODE } from './catalogue'
import { buildVariables, statesPay, type LetterVariables } from './render'

type DbCtx = Pick<Ctx, 'db'>

/** The wording in use for a template: HR's edit when there is one, else the shipped text. */
export async function templateWording(ctx: DbCtx, code: string): Promise<{ subject: string; body: string; customised: boolean }> {
  const custom = await ctx.db(LetterTemplate).findOne({ code }).lean()
  if (custom) return { subject: custom.subject, body: custom.body, customised: true }
  const shipped = BODIES[code] ?? { subject: '', body: '' }
  return { ...shipped, customised: false }
}

export async function customisedCodes(ctx: DbCtx): Promise<Set<string>> {
  return new Set(await ctx.db(LetterTemplate).distinct('code'))
}

/** Template codes whose letters state pay (by input or by wording, including HR's edits). */
export async function payLetterCodes(ctx: DbCtx): Promise<Set<string>> {
  const custom = new Map((await ctx.db(LetterTemplate).find({}).lean()).map((t) => [t.code, t]))
  return new Set(LETTERS.filter((l) => statesPay(l, custom.get(l.code) ?? BODIES[l.code])).map((l) => l.code))
}

export async function getLetter(ctx: DbCtx, id: string) {
  if (!isValidObjectId(id)) return null
  return ctx.db(Letter).findById(id).lean()
}
export type LetterRecord = NonNullable<Awaited<ReturnType<typeof getLetter>>>

/** Every value the letter can use, as the reader is allowed to see it (salary only with payroll.read). */
export async function variablesFor(
  ctx: Pick<Ctx, 'db' | 'org' | 'can'>,
  input: { employeeId: string; templateCode: string; inputs: Record<string, string>; reference: string; issueDate: string; signatoryName: string; signatoryDesignation: string },
): Promise<LetterVariables | null> {
  const employee = await ctx.db(Employee).findById(input.employeeId).lean()
  if (!employee) return null
  const [department, manager, structure] = await Promise.all([
    employee.departmentId ? ctx.db(Department).findById(employee.departmentId, { name: 1 }).lean() : null,
    employee.managerId ? ctx.db(Employee).findById(employee.managerId, { fullName: 1 }).lean() : null,
    ctx.can('payroll.read') ? ctx.db(SalaryStructure).findOne({ employeeId: employee._id }).sort({ effectiveFrom: -1 }).lean() : null,
  ])
  return buildVariables(
    {
      employee: {
        fullName: employee.fullName,
        code: employee.code,
        workEmail: employee.workEmail,
        designation: employee.designation,
        department: department?.name,
        manager: manager?.fullName,
        joinDate: employee.joinDate,
        exitDate: employee.exitDate,
        employmentType: employee.employmentType,
        employmentTypeLabel: EMPLOYMENT_TYPE_LABEL[employee.employmentType as EmploymentType] ?? employee.employmentType,
        statusLabel: statusLabelOf(employee.status),
        workLocation: employee.workLocation,
      },
      company: { name: companyProfileOf(ctx.org).legalName, address: orgAddressLine(ctx.org) },
      letter: { reference: input.reference, issueDate: input.issueDate, signatoryName: input.signatoryName, signatoryDesignation: input.signatoryDesignation },
      salary: ctx.can('payroll.read') && structure ? { monthlyGross: structure.monthlyGross, ctcAnnual: structure.ctcAnnual } : null,
      inputs: input.inputs,
      today: todayIST(),
    },
    LETTERS_BY_CODE.get(input.templateCode),
  )
}

/** Inputs stored on a letter as strings (Mixed field). */
export const inputsOf = (value: unknown): Record<string, string> =>
  value && typeof value === 'object' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)])) : {}
