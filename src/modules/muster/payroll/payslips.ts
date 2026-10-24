import 'server-only'
import { todayIST } from '@/lib/dates'
import { mailOutcome, staffMailTo } from '@/modules/muster/people/mail-to'
import type { Ctx } from '@/lib/ctx'
import { saveFile } from '@/lib/files'
import { emailLayout, sendMail } from '@/lib/mail'
import { Employee } from '@/models/muster/Employee'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { Payslip } from '@/models/muster/Payslip'
import { defaultSignatoryOf } from '@/lib/company-profile'
import { companyPdfOf, pdfSignature } from '@/lib/pdf/org-branding'
import { payslipFileName, payslipNumberOf, orgPrefix } from './numbers'
import { renderPayslipPdf, type PayslipData, type PayslipLanguage } from './payslip-pdf'
import { cycleLabel, type CycleRecord } from './queries'
import { readSnapshot } from './snapshot'
import { emitEvent } from '@/modules/automations/engine'
import { Member } from '@/models/Member'

type EntryRecord = NonNullable<Awaited<ReturnType<typeof loadEntry>>>
const loadEntry = (ctx: Pick<Ctx, 'db'>, id: unknown) => ctx.db(PayrollEntry).findById(id).lean()

const maskId = (value: string): string => (value ? `${'•'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : value)

/** The snapshot with PAN and UAN masked to their last four characters. */
function withMaskedIds(snapshot: PayslipData['snapshot']): PayslipData['snapshot'] {
  if (!snapshot) return snapshot
  return { ...snapshot, employee: { ...snapshot.employee, pan: maskId(snapshot.employee.pan), uan: maskId(snapshot.employee.uan) } }
}

/** Everything the payslip PDF prints, from the entry and its snapshot. `maskIds` hides PAN and UAN (viewer without sensitive access). */
export function payslipDataOf(org: { name: string }, cycle: { year: number; month: number }, entry: EntryRecord, opts: { maskIds?: boolean } = {}): PayslipData {
  const snapshot = readSnapshot(entry.snapshot)
  return {
    monthLabel: cycleLabel(cycle),
    payslipNumber: payslipNumberOf(orgPrefix(org), cycle.year, cycle.month, entry.employeeCode ?? String(entry.employeeId).slice(-6)),
    employeeName: entry.employeeName,
    employeeCode: entry.employeeCode ?? '',
    workingDays: entry.workingDays,
    payableDays: entry.payableDays,
    lopDays: entry.lopDays,
    totalEarnings: entry.totalEarnings,
    totalDeductions: entry.totalDeductions,
    reimbursementAmount: entry.reimbursementAmount,
    netPay: entry.netPay,
    lines: entry.lines.map((l) => ({ code: l.code, label: l.label, lineType: l.lineType, amount: l.amount })),
    snapshot: opts.maskIds ? withMaskedIds(snapshot) : snapshot,
  }
}

export async function renderEntryPayslip(ctx: Pick<Ctx, 'db' | 'org'>, cycle: { year: number; month: number }, entry: EntryRecord, opts: { maskIds?: boolean; language?: PayslipLanguage } = {}) {
  const data = payslipDataOf(ctx.org, cycle, entry, opts)
  const company = await companyPdfOf(ctx.org)
  const signature = company.profile.signPayslips ? await pdfSignature(ctx.org._id, company.profile.legalName, defaultSignatoryOf(company.profile)) : null
  const pdf = await renderPayslipPdf(company.letterhead, data, opts.language, signature)
  return { pdf, data, filename: payslipFileName(cycle.year, cycle.month, data.employeeCode || 'employee') }
}

export type PublishReport = { published: number; emailed: number; failures: { name: string; reason: string }[] }

/** Entry ids whose payslip for this cycle was already emailed from that same entry (a regenerated entry has a new id). */
async function alreadyEmailedEntries(ctx: Ctx, cycleId: unknown): Promise<Set<string>> {
  const slips = await ctx.db(Payslip).find({ cycleId, isPublished: true, emailedAt: { $ne: null } }, { entryId: 1 }).lean()
  return new Set(slips.map((s) => String(s.entryId)))
}

/**
 * Renders, stores, records and emails every payable entry's payslip. Email
 * failures never stop the run. Unless `resend` (the explicit Re-send), people
 * already emailed this entry's payslip are skipped, so pressing Publish again
 * after a run was cut short (a timeout) finishes the rest without emailing
 * anyone twice.
 */
export async function publishPayslips(ctx: Ctx, cycle: CycleRecord, opts: { resend?: boolean } = {}): Promise<PublishReport> {
  const entries = await ctx.db(PayrollEntry).find({ cycleId: cycle._id, status: 'ready' }).lean()
  const employees = await ctx.db(Employee).find({ _id: { $in: entries.map((e) => e.employeeId) } }, { workEmail: 1, personalEmail: 1, status: 1, exitDate: 1, fullName: 1 }).lean()
  const today = todayIST()
  const emailOf = new Map(employees.map((e) => [String(e._id), staffMailTo(e, today)]))
  const label = cycleLabel(cycle)
  const report: PublishReport = { published: 0, emailed: 0, failures: [] }
  const done = opts.resend ? new Set<string>() : await alreadyEmailedEntries(ctx, cycle._id)

  for (const entry of entries) {
    if (done.has(String(entry._id))) {
      report.published += 1
      report.emailed += 1
      continue
    }
    const { pdf, data, filename } = await renderEntryPayslip(ctx, cycle, entry)
    const file = await saveFile(ctx, { name: filename, mime: 'application/pdf', data: pdf, kind: 'payslip', entity: 'PayrollEntry', entityId: entry._id })
    const generatedAt = new Date(data.snapshot?.generatedAt ?? Date.now())
    // One payslip per person per month, keyed by cycle + employee: regeneration replaces the entries (new ids),
    // and a re-send must update the earlier payslip rather than insert a second one with the same number.
    const slipKey = { cycleId: cycle._id, employeeId: entry.employeeId }
    const slip = await ctx.db(Payslip).findOneAndUpdate(
      slipKey,
      { $set: { entryId: entry._id, year: cycle.year, month: cycle.month, payslipNumber: data.payslipNumber, fileId: file._id, netPay: entry.netPay, generatedAt, isPublished: true } },
      { upsert: true, returnDocument: 'after' },
    )
    report.published += 1
    await emitPayslipPublished(ctx, { employeeId: String(entry.employeeId), name: entry.employeeName, month: label, cycleId: String(cycle._id) })
    const to = emailOf.get(String(entry.employeeId))
    if (!to) {
      report.failures.push({ name: entry.employeeName, reason: 'No email on record' })
      continue
    }
    const mail = emailLayout({
      title: `Your ${label} payslip is available`,
      // No pay figures in the body: mail previews and shared screens show it. The attachment has them.
      paragraphs: [`Hello ${data.employeeName.split(' ')[0]},`, `Your payslip for ${label} is attached.`, 'You can also download it any time from My payslips.'],
      cta: { label: 'Open My payslips', href: '/app/me/payslips' },
    })
    const sent = await sendMail({ to, subject: `Your ${label} payslip is available`, ...mail, attachments: [{ filename, content: pdf, mime: 'application/pdf', fileId: file._id }], orgId: ctx.orgId, kind: 'payslip', entity: 'Payslip', entityId: slip?._id, retry: false })
    const outcome = mailOutcome(sent)
    if (outcome === 'sent') {
      report.emailed += 1
      await ctx.db(Payslip).updateOne(slipKey, { $set: { emailedAt: new Date() }, $unset: { emailError: 1 } })
    } else if (outcome === 'outbox') {
      // Nothing left the building, so a later Publish tries this person again (as letters do).
      const reason = 'Email is not configured, so it is only in Settings → Email log'
      report.failures.push({ name: entry.employeeName, reason })
      await ctx.db(Payslip).updateOne(slipKey, { $set: { emailError: reason } })
    } else {
      report.failures.push({ name: entry.employeeName, reason: sent.error ?? 'Email could not be sent' })
      await ctx.db(Payslip).updateOne(slipKey, { $set: { emailError: sent.error ?? 'Email could not be sent' } })
    }
  }
  // Anyone published earlier but no longer payable this month (now on hold or excluded) loses access to the old slip.
  await ctx.db(Payslip).updateMany({ cycleId: cycle._id, employeeId: { $nin: entries.map((e) => e.employeeId) }, isPublished: true }, { $set: { isPublished: false } })
  return report
}

/** "Email could not be sent: A, B and 3 more." grouped by reason. */
export function failureSummary(failures: PublishReport['failures']): string {
  const byReason = new Map<string, string[]>()
  for (const f of failures) byReason.set(f.reason, [...(byReason.get(f.reason) ?? []), f.name])
  return [...byReason.entries()]
    .map(([reason, names]) => `${reason}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''}.`)
    .join(' ')
}

/** `payslip.published` for the "your payslip is ready" automation: no amounts in it, ever. */
async function emitPayslipPublished(ctx: Ctx, input: { employeeId: string; name: string; month: string; cycleId: string }): Promise<void> {
  const employee = await ctx.db(Employee).findById(input.employeeId, { memberId: 1 }).lean()
  const member = employee?.memberId ? await ctx.db(Member).findOne({ _id: employee.memberId, status: 'active' }, { userId: 1 }).lean() : null
  await emitEvent(ctx.orgId, 'payslip.published', {
    entity: 'Employee',
    entityId: input.employeeId,
    occurrence: input.cycleId,
    vars: { employee_name: input.name, business_name: ctx.org.name, month: input.month },
    refs: { employeeId: input.employeeId, href: '/app/me/payslips', users: { employee: member ? [String(member.userId)] : [] } },
  })
}
