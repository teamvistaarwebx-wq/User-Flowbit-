import 'server-only'
import { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { dbConnect } from '@/lib/db'

/**
 * Read-only access to muster-b's collections (salary structures, letters,
 * payslips, payroll cycles) without importing their model files, so this area
 * builds whether or not those files exist yet. Every query carries `orgId`
 * explicitly; a missing collection simply returns nothing.
 */
async function collection(name: string) {
  const conn = await dbConnect()
  return conn.connection.collection(name)
}

type Doc = Record<string, unknown> & { _id: Types.ObjectId }

async function findIn(ctx: Pick<Ctx, 'orgId'>, name: string, filter: Record<string, unknown>, sort: Record<string, 1 | -1> = { _id: -1 }, limit = 200): Promise<Doc[]> {
  try {
    const col = await collection(name)
    return (await col.find({ ...filter, orgId: ctx.orgId }).sort(sort).limit(limit).toArray()) as unknown as Doc[]
  } catch (error) {
    console.error(`[muster] could not read ${name}`, error)
    return []
  }
}

/** Employees with an open salary structure (effectiveTo null). */
export async function employeesWithSalary(ctx: Pick<Ctx, 'orgId'>): Promise<Set<string>> {
  const rows = await findIn(ctx, 'salarystructures', { effectiveTo: null }, { _id: -1 }, 5000)
  return new Set(rows.map((r) => String(r.employeeId)))
}

export type CurrentSalary = { monthlyGross: number; ctcAnnual: number; effectiveFrom: string } | null

export async function currentSalary(ctx: Pick<Ctx, 'orgId'>, employeeId: string): Promise<CurrentSalary> {
  const [row] = await findIn(ctx, 'salarystructures', { employeeId: new Types.ObjectId(employeeId), effectiveTo: null }, { effectiveFrom: -1 }, 1)
  if (!row) return null
  return { monthlyGross: Number(row.monthlyGross ?? 0), ctcAnnual: Number(row.ctcAnnual ?? 0), effectiveFrom: String(row.effectiveFrom ?? '') }
}

/** `pdfHref` is muster-b's letter PDF route (renders on demand; letters carry no stored file). */
export type LetterRow = { id: string; templateName: string; referenceNumber: string; issueDate: string; status: string; statesPay: boolean; pdfHref: string; emailed: boolean }

export async function lettersFor(ctx: Pick<Ctx, 'orgId'>, employeeId: string): Promise<LetterRow[]> {
  const rows = await findIn(ctx, 'letters', { employeeId: new Types.ObjectId(employeeId) }, { createdAt: -1 })
  return rows.map((r) => ({
    id: String(r._id),
    templateName: String(r.templateName ?? r.templateCode ?? 'Letter'),
    referenceNumber: String(r.referenceNumber ?? ''),
    issueDate: String(r.issueDate ?? ''),
    status: String(r.status ?? 'draft'),
    statesPay: Boolean(r.statesPay),
    pdfHref: `/api/muster/letters/${r._id}`,
    emailed: Boolean(r.emailedAt),
  }))
}

/** `pdfHref` is muster-b's payslip PDF route, keyed by the payroll entry (payslips carry no stored file). */
export type PayslipRow = { id: string; month: string; netPay: number; number: string; pdfHref: string | null; published: boolean }

export async function payslipsFor(ctx: Pick<Ctx, 'orgId'>, employeeId: string): Promise<PayslipRow[]> {
  const rows = await findIn(ctx, 'payslips', { employeeId: new Types.ObjectId(employeeId) }, { year: -1, month: -1 })
  return rows.map((r) => ({
    id: String(r._id),
    month: r.year && r.month ? `${r.year}-${String(r.month).padStart(2, '0')}` : '',
    netPay: Number(r.netPay ?? 0),
    number: String(r.payslipNumber ?? ''),
    pdfHref: r.entryId ? `/api/muster/payslips/${r.entryId}` : null,
    published: Boolean(r.isPublished),
  }))
}

/** Payroll statuses at or after locking: attendance for that month must stay locked. */
const PAYROLL_FROZEN = new Set(['locked', 'released', 'payslips_published'])

export async function payrollFrozen(ctx: Pick<Ctx, 'orgId'>, year: number, month: number): Promise<boolean> {
  const [cycle] = await findIn(ctx, 'payrollcycles', { year, month }, { _id: -1 }, 1)
  return Boolean(cycle && PAYROLL_FROZEN.has(String(cycle.status)))
}
