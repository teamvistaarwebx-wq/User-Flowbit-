import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { formatMonth, isoDateIST, monthRange, todayIST } from '@/lib/dates'
import { Claim } from '@/models/muster/Claim'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { Department } from '@/models/muster/Department'
import { Employee } from '@/models/muster/Employee'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { getMonthRegister } from '@/modules/muster/attendance/queries'
import { teamBalances } from '@/modules/muster/leave/balances'
import { CLAIM_STATUS_LABELS, type ClaimStatus } from '@/modules/muster/claims/constants'
import { DIRECTORY_STATUSES, EMPLOYMENT_TYPE_LABEL, statusLabelOf, type EmploymentType } from '@/modules/muster/people/lifecycle'
import { PARTIAL_VIEW_REFUSAL, visibleEmployeeIds } from '@/modules/muster/people/scope'
import { buildPayrollJournal } from '@/modules/muster/payroll/journal'
import { readSnapshot } from '@/modules/muster/payroll/snapshot'
import { gratuityRows } from './gratuity'
import { rupees, type CsvCell } from './csv'
import { REPORTS, type ReportKey } from './catalog'

export type ReportTable = { title: string; header: string[]; rows: CsvCell[][]; filename: string }
export type ReportResult = { ok: true; table: ReportTable } | { ok: false; error: string }

const amount = (lines: { code: string; lineType: string; amount: number }[], code: string) => lines.filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0)

async function employeeMaster(ctx: Ctx): Promise<ReportTable> {
  const [people, departments] = await Promise.all([ctx.db(Employee).find({ deletedAt: null }).sort({ code: 1 }).lean(), ctx.db(Department).find({}, { name: 1 }).lean()])
  const dept = new Map(departments.map((d) => [String(d._id), d.name]))
  const name = new Map(people.map((p) => [String(p._id), p.fullName]))
  return {
    title: 'Employee master',
    header: ['Employee ID', 'Name', 'Work Email', 'Phone', 'Department', 'Designation', 'Manager', 'Employment Type', 'Status', 'Date of Joining', 'Work Location', 'Date of Exit'],
    rows: people.map((p) => [p.code, p.fullName, p.workEmail, p.phone, p.departmentId ? dept.get(String(p.departmentId)) : '', p.designation, p.managerId ? name.get(String(p.managerId)) : '', EMPLOYMENT_TYPE_LABEL[p.employmentType as EmploymentType] ?? p.employmentType, statusLabelOf(p.status), p.joinDate, p.workLocation, p.exitDate]),
    filename: `employee-master-${todayIST()}.csv`,
  }
}

async function attendanceSummary(ctx: Ctx, month: string): Promise<ReportResult> {
  if ((await visibleEmployeeIds(ctx)) !== null) return { ok: false, error: PARTIAL_VIEW_REFUSAL }
  const register = await getMonthRegister(ctx, month)
  return {
    ok: true,
    table: {
      title: `Attendance summary · ${formatMonth(month)}`,
      header: ['Employee ID', 'Name', 'Department', 'Working Days', 'Present', 'WFH', 'Late', 'Half Days', 'Paid Leave', 'Sick Leave', 'Unpaid Leave', 'Absent', 'Holidays', 'Not Marked', 'LOP Days', 'Payable Days'],
      rows: register.rows.map((r) => [r.code, r.name, r.department, r.summary.workingDays, r.summary.presentDays, r.summary.wfhDays, r.summary.lateDays, r.summary.halfDays, r.summary.leaveDays - r.summary.sickLeaveDays, r.summary.sickLeaveDays, r.summary.unpaidLeaveDays, r.summary.absentDays, r.summary.holidays, r.summary.unmarkedDays, r.summary.lopDays, r.summary.payableDays]),
      filename: `attendance-${month}.csv`,
    },
  }
}

async function leaveRequests(ctx: Ctx, month: string): Promise<ReportTable> {
  const { start, end } = monthRange(month)
  const rows = await ctx.db(LeaveRequest).find({ startDate: { $lte: end }, endDate: { $gte: start } }).sort({ startDate: 1 }).lean()
  const people = new Map((await ctx.db(Employee).find({ _id: { $in: rows.map((r) => r.employeeId) } }, { fullName: 1, code: 1 }).lean()).map((e) => [String(e._id), e]))
  return {
    title: `Leave requests · ${formatMonth(month)}`,
    header: ['Employee ID', 'Employee', 'Type', 'From', 'To', 'Days', 'Paid', 'Unpaid', 'Status', 'Decided by', 'Decided on'],
    rows: rows.map((r) => {
      const e = people.get(String(r.employeeId))
      const last = r.decisions?.at(-1)
      return [e?.code, e?.fullName, r.leaveName, r.startDate, r.endDate, r.dayCount, r.paidDays, r.unpaidDays, r.status, r.decidedAt ? last?.decidedByName : '', r.decidedAt ? isoDateIST(r.decidedAt) : '']
    }),
    filename: `leave-${month}.csv`,
  }
}

async function leaveBalances(ctx: Ctx): Promise<ReportTable> {
  const today = todayIST()
  const [people, departments] = await Promise.all([
    ctx.db(Employee).find({ deletedAt: null, status: { $in: DIRECTORY_STATUSES } }, { code: 1, fullName: 1, departmentId: 1, employmentType: 1, status: 1, joinDate: 1, exitDate: 1 }).sort({ code: 1 }).lean(),
    ctx.db(Department).find({}, { name: 1 }).lean(),
  ])
  const dept = new Map(departments.map((d) => [String(d._id), d.name]))
  const { year, byEmployee } = await teamBalances(ctx, people, today)
  return {
    title: `Leave balances · ${year.label} as of ${today}`,
    header: ['Employee ID', 'Name', 'Department', 'Leave Type', 'Accrues', 'Opening', 'Accrued', 'Adjusted', 'Taken', 'Pending', 'Remaining'],
    rows: people.flatMap((p) => (byEmployee.get(String(p._id)) ?? []).map((b) => [p.code, p.fullName, p.departmentId ? dept.get(String(p.departmentId)) : '', b.name, b.accrues ? 'Yes' : 'No', b.opening, b.accrued, b.adjusted, b.taken, b.pending, b.remaining ?? 'Per request'])),
    filename: `leave-balances-${today}.csv`,
  }
}

async function cycleEntries(ctx: Ctx, month: string) {
  const [year, m] = month.split('-').map(Number)
  const cycle = await ctx.db(PayrollCycle).findOne({ year, month: m }).lean()
  if (!cycle) return null
  const entries = await ctx.db(PayrollEntry).find({ cycleId: cycle._id, status: { $ne: 'excluded' } }).sort({ employeeCode: 1 }).lean()
  return { cycle, entries }
}

const NO_PAYROLL = (month: string): ReportResult => ({ ok: false, error: `${formatMonth(month)} payroll has not been generated, so there is nothing to export yet.` })

async function salaryRegister(ctx: Ctx, month: string): Promise<ReportResult> {
  const found = await cycleEntries(ctx, month)
  if (!found?.entries.length) return NO_PAYROLL(month)
  return {
    ok: true,
    table: {
      title: `Salary register · ${formatMonth(month)}`,
      header: ['Employee ID', 'Name', 'Status', 'Monthly Gross', 'Working Days', 'Payable Days', 'LOP Days', 'Earned Gross', 'Total Earnings', 'PF', 'ESI', 'Professional Tax', 'TDS', 'Total Deductions', 'Reimbursements', 'Net Pay', 'Employer PF', 'Employer ESI'],
      rows: found.entries.map((e) => [e.employeeCode, e.employeeName, e.status, rupees(e.monthlyGross), e.workingDays, e.payableDays, e.lopDays, rupees(e.earnedGross), rupees(e.totalEarnings), rupees(amount(e.lines, 'PF_EE')), rupees(amount(e.lines, 'ESI_EE')), rupees(amount(e.lines, 'PT')), rupees(amount(e.lines, 'TDS')), rupees(e.totalDeductions), rupees(e.reimbursementAmount), rupees(e.netPay), rupees(amount(e.lines, 'PF_ER')), rupees(amount(e.lines, 'ESI_ER'))]),
      filename: `salary-register-${month}.csv`,
    },
  }
}

async function statutory(ctx: Ctx, month: string): Promise<ReportResult> {
  const found = await cycleEntries(ctx, month)
  if (!found?.entries.length) return NO_PAYROLL(month)
  // UAN, PAN and ESIC numbers are sensitive IDs (people.read_sensitive), not pay figures.
  const ids = ctx.can('people.read_sensitive')
  return {
    ok: true,
    table: {
      title: `PF / ESI / PT · ${formatMonth(month)}`,
      header: ['Employee ID', 'Name', 'UAN', 'PAN', 'ESIC Number', 'PT State', 'PF Wage', 'Employee PF', 'Employer PF', 'ESI Wage', 'Employee ESI', 'Employer ESI', 'Professional Tax', 'LWF Employee', 'LWF Employer', 'TDS'],
      rows: found.entries.map((e) => {
        const s = readSnapshot(e.snapshot)
        return [e.employeeCode, e.employeeName, ids ? s?.employee.uan : '', ids ? s?.employee.pan : '', ids ? s?.employee.esicNumber : '', s?.employee.ptState, rupees(s?.result.pfWage ?? 0), rupees(amount(e.lines, 'PF_EE')), rupees(amount(e.lines, 'PF_ER')), rupees(s?.result.esiWage ?? 0), rupees(amount(e.lines, 'ESI_EE')), rupees(amount(e.lines, 'ESI_ER')), rupees(amount(e.lines, 'PT')), rupees(amount(e.lines, 'LWF_EE')), rupees(amount(e.lines, 'LWF_ER')), rupees(amount(e.lines, 'TDS'))]
      }),
      filename: `statutory-${month}.csv`,
    },
  }
}

async function journal(ctx: Ctx, month: string): Promise<ReportResult> {
  const found = await cycleEntries(ctx, month)
  if (!found?.entries.length) return NO_PAYROLL(month)
  const ready = found.entries.filter((e) => e.status === 'ready')
  const j = buildPayrollJournal({ month: formatMonth(month), entries: ready.map((e) => ({ grossEarnings: e.totalEarnings, reimbursement: e.reimbursementAmount, netPay: e.netPay, lines: e.lines })) })
  return {
    ok: true,
    table: {
      title: `Payroll journal · ${formatMonth(month)}${j.balanced ? '' : ' · DOES NOT BALANCE'}`,
      header: ['Account', 'Debit', 'Credit', 'Narration'],
      rows: [...j.lines.map((l) => [l.account, l.debit ? rupees(l.debit) : '', l.credit ? rupees(l.credit) : '', l.note]), ['TOTAL', rupees(j.totalDebit), rupees(j.totalCredit), j.balanced ? `${j.employeeCount} employee${j.employeeCount === 1 ? '' : 's'}` : 'DOES NOT BALANCE - do not post; regenerate payroll and re-export']],
      filename: `payroll-journal-${month}.csv`,
    },
  }
}

async function claims(ctx: Ctx): Promise<ReportTable> {
  const [rows, categories] = await Promise.all([ctx.db(Claim).find({}).sort({ expenseDate: -1 }).limit(5000).lean(), ctx.db(ClaimCategory).find({}, { name: 1 }).lean()])
  const people = new Map((await ctx.db(Employee).find({ _id: { $in: rows.map((r) => r.employeeId) } }, { fullName: 1, code: 1 }).lean()).map((e) => [String(e._id), e]))
  const category = new Map(categories.map((c) => [String(c._id), c.name]))
  return {
    title: 'Claims',
    header: ['Employee ID', 'Name', 'Expense Date', 'Category', 'Vendor', 'Purpose', 'Client/Project', 'Claimed', 'Approved', 'Status', 'Review Note'],
    rows: rows.map((r) => {
      const e = people.get(String(r.employeeId))
      return [e?.code, e?.fullName, r.expenseDate, category.get(String(r.categoryId)), r.vendor, r.purpose, r.project, rupees(r.amountClaimed), r.amountApproved == null ? '' : rupees(r.amountApproved), CLAIM_STATUS_LABELS[r.status as ClaimStatus] ?? r.status, r.reviewNote]
    }),
    filename: `claims-${todayIST()}.csv`,
  }
}

async function gratuity(ctx: Ctx): Promise<ReportTable> {
  const rows = await gratuityRows(ctx)
  return {
    title: 'Gratuity',
    header: ['Employee ID', 'Name', 'Status', 'Service From', 'Served', 'Monthly Wage Base', 'Eligible', 'Qualified By', 'Years Counted', 'Amount', 'Capped', 'Qualifies On'],
    rows: rows.map((r) => [r.code, r.name, r.status, r.serviceFrom, r.served, rupees(r.wageBase), r.result.isEligible ? 'Yes' : 'No', r.result.qualifiedBy ?? '', r.result.years, rupees(r.result.amount), r.result.isCapped ? 'Yes' : 'No', r.result.qualifiesOn ?? '']),
    filename: `gratuity-${todayIST()}.csv`,
  }
}

/** Builds one report after checking the reader may see it. */
export async function buildReport(ctx: Ctx, key: ReportKey, month: string): Promise<ReportResult> {
  const def = REPORTS[key]
  if (!ctx.can('hr.reports') && !(def.payroll && ctx.can('payroll.read'))) return { ok: false, error: 'Reports need the HR reports permission.' }
  if (def.payroll && (!ctx.can('payroll.read') || !ctx.hasFeature('muster.payroll'))) return { ok: false, error: 'This report shows pay, so it needs payroll access on Muster Business.' }
  if (key === 'claims' && !ctx.can('claims.read')) return { ok: false, error: 'This report needs access to everyone’s claims.' }
  if ((await visibleEmployeeIds(ctx)) !== null) return { ok: false, error: 'Reports cover the whole company, and your role sees only part of it.' }
  switch (key) {
    case 'employees':
      return { ok: true, table: await employeeMaster(ctx) }
    case 'attendance':
      return attendanceSummary(ctx, month)
    case 'leave':
      return { ok: true, table: await leaveRequests(ctx, month) }
    case 'leave_balances':
      return { ok: true, table: await leaveBalances(ctx) }
    case 'salary_register':
      return salaryRegister(ctx, month)
    case 'statutory':
      return statutory(ctx, month)
    case 'journal':
      return journal(ctx, month)
    case 'claims':
      return { ok: true, table: await claims(ctx) }
    case 'gratuity':
      return { ok: true, table: await gratuity(ctx) }
  }
}
