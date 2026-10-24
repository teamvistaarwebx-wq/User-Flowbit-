import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { monthRange } from '@/lib/dates'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Employee } from '@/models/muster/Employee'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { FolioEntity } from '@/models/folio/Entity'
import { maskAccount } from './money'
import { payeeProblem, type BankPayee } from './bank-file'
import { cycleLabel, cycleMonth, type CycleRecord } from './queries'
import { isAtLeast, type PayrollStatus } from './stages'

/** Account numbers leave the building in this file, so it needs sensitive access and a release or lock role. */
export const mayExportBankFile = (ctx: Ctx) => ctx.can('payroll.read') && ctx.can('people.read_sensitive') && ctx.canAny('payroll.release', 'payroll.lock')
/** Only figures that can no longer change are paid out. */
export const bankFileReady = (status: string) => isAtLeast(status as PayrollStatus, 'locked')

/** Everyone being paid this month (ready entries with net pay), with their bank details. An unverified self-service bank change keeps the person out of the file. */
export async function bankPayees(ctx: Ctx, cycle: CycleRecord): Promise<BankPayee[]> {
  const entries = await ctx.db(PayrollEntry).find({ cycleId: cycle._id, status: 'ready', netPay: { $gt: 0 } }, { employeeId: 1, employeeName: 1, employeeCode: 1, netPay: 1 }).sort({ employeeName: 1 }).lean()
  const ids = entries.map((e) => e.employeeId)
  const [people, pending] = await Promise.all([
    ctx.db(Employee).find({ _id: { $in: ids } }, { bank: 1, workEmail: 1 }).lean(),
    ctx.db(BankChangeRequest).distinct('employeeId', { employeeId: { $in: ids }, verifiedAt: null }),
  ])
  const byId = new Map(people.map((p) => [String(p._id), p]))
  const unverified = new Set(pending.map(String))
  return entries.map((e) => {
    const p = byId.get(String(e.employeeId))
    return { code: e.employeeCode ?? '', name: e.employeeName, accountName: p?.bank?.accountName, accountNumber: p?.bank?.accountNumber?.replace(/\s+/g, ''), ifsc: p?.bank?.ifsc, email: p?.workEmail, amountPaise: e.netPay, unverifiedChange: unverified.has(String(e.employeeId)) }
  })
}

export type BankFileSummary = {
  payable: number
  totalPaise: number
  skipped: { name: string; reason: string }[]
  accounts: { value: string; label: string }[]
  narration: string
  valueDate: string
}

/** What the export dialog shows: who will be paid, who cannot be, and the company's accounts to pay from (masked). */
export async function bankFileSummary(ctx: Ctx, cycle: CycleRecord): Promise<BankFileSummary> {
  const [payees, entities] = await Promise.all([bankPayees(ctx, cycle), ctx.db(FolioEntity).find({ isActive: { $ne: false } }, { tradeName: 1, legalName: 1, bankAccounts: 1 }).lean()])
  const ok = payees.filter((p) => !payeeProblem(p))
  const accounts = entities.flatMap((e) =>
    (e.bankAccounts ?? []).map((b) => ({ value: b.accountNumber, label: `${b.bankName} ${maskAccount(b.accountNumber)} · ${b.label} (${e.tradeName || e.legalName})` })),
  )
  return {
    payable: ok.length,
    totalPaise: ok.reduce((s, p) => s + p.amountPaise, 0),
    skipped: payees.flatMap((p) => {
      const reason = payeeProblem(p)
      return reason ? [{ name: p.name, reason }] : []
    }),
    accounts,
    narration: `Salary ${cycleLabel(cycle)}`,
    valueDate: cycle.paymentDate ?? monthRange(cycleMonth(cycle)).end,
  }
}
