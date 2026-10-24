import type { Types } from 'mongoose'
import { eachDay, istInstant, todayIST, weekday } from '@/lib/dates'
import type { SeedCtx } from '@/lib/seed-types'
import { bumpSeq } from '@/lib/sequence'
import { AttendanceDay } from '@/models/AttendanceDay'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Claim } from '@/models/muster/Claim'
import { ClaimCategory } from '@/models/muster/ClaimCategory'
import { ClaimForm } from '@/models/muster/ClaimForm'
import { Department } from '@/models/muster/Department'
import { Employee } from '@/models/muster/Employee'
import { Holiday } from '@/models/muster/Holiday'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { Letter } from '@/models/muster/Letter'
import { PayrollAdjustment } from '@/models/muster/PayrollAdjustment'
import { PayrollCycle } from '@/models/muster/PayrollCycle'
import { PayrollEntry } from '@/models/muster/PayrollEntry'
import { Payslip } from '@/models/muster/Payslip'
import { SalaryComponent } from '@/models/muster/SalaryComponent'
import { SalaryStructure } from '@/models/muster/SalaryStructure'
import { StatutoryVersion } from '@/models/muster/StatutoryVersion'
import { OVERRIDE_STATUSES, employedOn, resolveDay, summariseMonth, workdaySet, type OverrideStatus } from './attendance/register'
import { STANDARD_CATEGORIES, type ClaimStatus } from './claims/constants'
import { windowFromDays } from './claims/rules'
import { BODIES } from './letters/bodies'
import { LETTERS_BY_CODE } from './letters/catalogue'
import { buildVariables, renderTemplate, statesPay } from './letters/render'
import { STANDARD_COMPONENTS } from './payroll/components'
import { buildEntry, registerTotals } from './payroll/entry-builder'
import { maskAccount, toPaise } from './payroll/money'
import { letterReference, orgPrefix, payslipNumberOf } from './payroll/numbers'
import { DEFAULT_STATUTORY, type StatutorySettings } from './payroll/statutory'
import { defaultLines, previewStructure } from './payroll/structure-lines'
import { EMPLOYMENT_TYPE_LABEL, statusLabelOf, type EmploymentType } from './people/lifecycle'

/**
 * Muster-b demo data (called from ./seed.ts after people, attendance and
 * leave exist): salary components and structures, statutory rates, a
 * September 2026 payroll taken all the way to published payslips, an open
 * October month, claim forms with claims in every state, and issued letters.
 */

type Id = Types.ObjectId
type Person = Awaited<ReturnType<typeof loadPeople>>[number]

/** Monthly gross in rupees by employee code order of seed-data (by name, so it survives reordering). */
const GROSS: Record<string, number> = {
  'Sanskaar Singh': 150000, 'Aditi Sharma': 90000, 'Neha Verma': 75000, 'Rohan Mehta': 32000, 'Priya Iyer': 85000, 'Arjun Nair': 95000,
  'Kavya Reddy': 40000, 'Vikram Joshi': 45000, 'Ishaan Gupta': 70000, 'Meera Pillai': 60000, 'Ananya Kulkarni': 38000, 'Karan Malhotra': 42000,
  'Pooja Desai': 36000, 'Rahul Chauhan': 65000, 'Sneha Banerjee': 28000, 'Tanvi Joshi': 15000, 'Harsh Vardhan': 55000, 'Manish Yadav': 50000,
}
const SEPT = { year: 2026, month: 9, start: '2026-09-01', end: '2026-09-30' }
const OCT = { year: 2026, month: 10, start: '2026-10-01', end: '2026-10-31' }

const loadPeople = (ctx: SeedCtx) => ctx.db(Employee).find({ deletedAt: null }).lean()
const by = (people: Person[], name: string) => people.find((p) => p.fullName === name)
const stamp = (ctx: SeedCtx, role: keyof SeedCtx['users'], date: string, time: string) => ({ at: istInstant(date, time), by: ctx.users[role]._id, name: ctx.users[role].name })

export async function seed(ctx: SeedCtx): Promise<void> {
  const people = await loadPeople(ctx)
  if (!people.length) {
    ctx.log('muster-b: no employees, skipped')
    return
  }
  const components = await ctx.db(SalaryComponent).insertMany(STANDARD_COMPONENTS.map((c) => ({ ...c, isActive: true })))
  const componentMap = new Map(components.map((c) => [c.code, c]))
  const settings = await seedStatutory(ctx)
  await seedStructures(ctx, people, componentMap)
  const sept = await seedSeptemberPayroll(ctx, people, componentMap, settings)
  const oct = await ctx.db(PayrollCycle).create({ year: OCT.year, month: OCT.month, periodStart: OCT.start, periodEnd: OCT.end, status: 'attendance_open' })
  await seedClaims(ctx, people, sept, oct._id)
  await seedLetters(ctx, people)
  await seedBankChanges(ctx, people)
  ctx.log('muster-b: components, statutory rates, structures, September payroll published, October open, claims, letters')
}

/** The rates before S.O. 5109(E): the demo's history, September payroll included, ran on the ₹15,000 ceiling. */
const RATES_BEFORE_SEP_2026: StatutorySettings = { ...DEFAULT_STATUTORY, pf: { ...DEFAULT_STATUTORY.pf, wageCeiling: 15000 } }

async function seedStatutory(ctx: SeedCtx): Promise<StatutorySettings> {
  await ctx.db(StatutoryVersion).insertMany([
    { effectiveFrom: '2000-01-01', payrollFrom: '2000-01-01', note: 'Rates in force when Muster was set up', settings: RATES_BEFORE_SEP_2026, confirmedAt: istInstant('2026-04-01', '11:00'), confirmedBy: ctx.users.finance._id, confirmedByName: ctx.users.finance.name, createdBy: ctx.users.hr_admin._id },
    {
      effectiveFrom: '2026-09-17',
      payrollFrom: '2026-10-01',
      note: 'EPF wage ceiling revised to 25,000 — payroll month proposed, confirm with CA',
      settings: { ...DEFAULT_STATUTORY, pf: { ...DEFAULT_STATUTORY.pf, wageCeiling: 25000 } },
      createdBy: ctx.users.hr_admin._id,
    },
  ])
  return RATES_BEFORE_SEP_2026
}

type ComponentMap = Map<string, { code: string; name: string; componentType: string; countsForPf?: boolean | null; countsForEsi?: boolean | null; countsForWages?: boolean | null; prorateOnLop?: boolean | null; displayOrder?: number | null }>

async function seedStructures(ctx: SeedCtx, people: Person[], components: ComponentMap) {
  const rows = people
    .filter((p) => GROSS[p.fullName])
    .map((p) => {
      const gross = toPaise(GROSS[p.fullName])
      const lines = defaultLines(gross)
      const { amounts } = previewStructure(gross, gross * 12, lines, components)
      return { employeeId: p._id, effectiveFrom: p.joinDate, effectiveTo: null, monthlyGross: gross, ctcAnnual: gross * 12, notes: 'Set at joining', createdBy: ctx.users.hr_admin._id, lines: lines.map((l) => ({ ...l, monthlyAmount: amounts.get(l.code) ?? 0 })) }
    })
  await ctx.db(SalaryStructure).insertMany(rows)
}

/** The September month register, built with the same pure rules HR's grid uses. */
async function septemberAttendance(ctx: SeedCtx, people: Person[]) {
  const days = eachDay(SEPT.start, SEPT.end)
  const ids = people.map((p) => p._id)
  const [holidays, punches, corrections, leaves] = await Promise.all([
    ctx.db(Holiday).find({ date: { $gte: SEPT.start, $lte: SEPT.end }, isOptional: { $ne: true } }).lean(),
    ctx.db(AttendanceDay).find({ date: { $gte: SEPT.start, $lte: SEPT.end } }, { memberId: 1, date: 1, status: 1, punches: 1 }).lean(),
    ctx.db(AttendanceCorrection).find({ employeeId: { $in: ids }, status: 'approved', date: { $gte: SEPT.start, $lte: SEPT.end } }).lean(),
    ctx.db(LeaveRequest).find({ employeeId: { $in: ids }, status: 'approved', startDate: { $lte: SEPT.end }, endDate: { $gte: SEPT.start } }).lean(),
  ])
  const workWeek = ctx.org.workWeek?.length ? ctx.org.workWeek : [1, 2, 3, 4, 5, 6]
  const workdays = workdaySet(days, workWeek, weekday)
  const holidayName = new Map(holidays.map((h) => [h.date, h.name]))
  const today = todayIST()
  return new Map(
    people.map((p) => {
      const cells = days.map((date) => {
        const override = corrections.find((c) => String(c.employeeId) === String(p._id) && c.date === date && (OVERRIDE_STATUSES as readonly string[]).includes(c.requestedStatus))
        const leave = leaves.find((l) => String(l.employeeId) === String(p._id) && (l.dates ?? []).includes(date))
        const punch = p.memberId ? punches.find((d) => String(d.memberId) === String(p.memberId) && d.date === date) : undefined
        return resolveDay({
          date,
          today,
          inEmployment: employedOn(date, p.joinDate, p.exitDate),
          workday: workdays.has(date),
          holidayName: holidayName.get(date),
          override: override ? { status: override.requestedStatus as OverrideStatus, reason: override.reason } : undefined,
          leave: leave ? { paid: !(leave.unpaidDates ?? []).includes(date), half: Boolean(leave.isHalfDay), label: leave.leaveName } : undefined,
          punch: punch ? { status: punch.status, worked: (punch.punches?.length ?? 0) > 0 } : undefined,
          policy: 'present',
        })
      })
      return [String(p._id), summariseMonth(cells, workdays)]
    }),
  )
}

async function seedSeptemberPayroll(ctx: SeedCtx, people: Person[], components: ComponentMap, settings: StatutorySettings) {
  const cycle = await ctx.db(PayrollCycle).create({
    year: SEPT.year, month: SEPT.month, periodStart: SEPT.start, periodEnd: SEPT.end, status: 'payslips_published',
    claimsClosed: stamp(ctx, 'hr_admin', '2026-09-28', '17:00'), generated: stamp(ctx, 'hr_admin', '2026-09-29', '11:15'), hrReviewed: stamp(ctx, 'hr_admin', '2026-09-29', '16:40'),
    financeApproved: stamp(ctx, 'finance', '2026-09-30', '10:05'), locked: stamp(ctx, 'finance', '2026-09-30', '10:20'), released: stamp(ctx, 'finance', '2026-09-30', '15:30'), published: stamp(ctx, 'finance', '2026-09-30', '16:00'),
    paymentDate: '2026-09-30', paymentReference: 'HDFCR52026093012871', paymentNotes: 'Bulk NEFT from the current account',
  })
  const harsh = by(people, 'Harsh Vardhan')
  const owner = by(people, 'Sanskaar Singh')
  const adjustments = [
    ...(harsh ? [{ cycleId: cycle._id, employeeId: harsh._id, year: 2026, month: 9, lineType: 'earning' as const, label: 'Performance incentive', amount: toPaise(5000), reason: 'Shipped the billing integration ahead of schedule', createdBy: ctx.users.hr_admin._id, createdByName: ctx.users.hr_admin.name }] : []),
    ...(owner ? [{ cycleId: cycle._id, employeeId: owner._id, year: 2026, month: 9, lineType: 'deduction' as const, label: 'TDS', amount: toPaise(14200), reason: 'Declared regime, monthly estimate', createdBy: ctx.users.finance._id, createdByName: ctx.users.finance.name }] : []),
  ]
  await ctx.db(PayrollAdjustment).insertMany(adjustments)

  const [structures, departments, attendance] = await Promise.all([ctx.db(SalaryStructure).find({}).lean(), ctx.db(Department).find({}, { name: 1 }).lean(), septemberAttendance(ctx, people)])
  const deptName = new Map(departments.map((d) => [String(d._id), d.name]))
  const generatedAt = istInstant('2026-09-29', '11:15')
  const inMonth = people.filter((p) => !['candidate', 'offered', 'joining_pending'].includes(p.status) && p.joinDate <= SEPT.end && (!p.exitDate || p.exitDate >= SEPT.start))
  const skipped: { employeeId: Id; name: string; reason: string }[] = []
  const claimTotal: Record<string, number> = { 'Vikram Joshi': toPaise(2350), 'Karan Malhotra': toPaise(4120) }
  const version = { id: '', effectiveFrom: '2000-01-01', payrollFrom: '2000-01-01', note: 'Rates in force when Muster was set up' }
  const entries = inMonth.flatMap((p) => {
    const structure = structures.find((s) => String(s.employeeId) === String(p._id))
    const summary = attendance.get(String(p._id))
    if (!structure || !summary) {
      skipped.push({ employeeId: p._id, name: p.fullName, reason: 'No salary structure is in force for this month.' })
      return []
    }
    return [
      buildEntry({
        cycleId: cycle._id, month: SEPT.month, generatedAt, person: p, structure, components, summary, settings, version,
        department: p.departmentId ? (deptName.get(String(p.departmentId)) ?? '') : '',
        adjustments: adjustments.filter((a) => String(a.employeeId) === String(p._id)),
        reimbursement: { total: claimTotal[p.fullName] ?? 0, claimIds: [] },
      }),
    ]
  })
  const inserted = await ctx.db(PayrollEntry).insertMany(entries)
  const prefix = orgPrefix(ctx.org)
  await ctx.db(Payslip).insertMany(inserted.map((e) => ({ entryId: e._id, employeeId: e.employeeId, cycleId: cycle._id, year: SEPT.year, month: SEPT.month, payslipNumber: payslipNumberOf(prefix, SEPT.year, SEPT.month, e.employeeCode ?? ''), netPay: e.netPay, generatedAt, emailedAt: istInstant('2026-09-30', '16:00'), isPublished: true })))
  await ctx.db(PayrollCycle).updateOne({ _id: cycle._id }, { $set: { ...registerTotals(entries), workingDays: entries[0]?.workingDays ?? 0, skipped } })
  return cycle._id
}

async function seedClaims(ctx: SeedCtx, people: Person[], septCycleId: Id, octCycleId: Id) {
  const categories = await ctx.db(ClaimCategory).insertMany(STANDARD_CATEGORIES.map((c, i) => ({ ...c, maxAmount: c.code === 'FOOD' ? toPaise(2000) : null, displayOrder: (i + 1) * 10, isActive: true })))
  const cat = (code: string) => categories.find((c) => c.code === code)!._id
  const septWindow = windowFromDays('2026-09-01', '2026-09-25')
  const octWindow = windowFromDays('2026-10-01', '2026-10-10')
  const [septForm, octForm] = await ctx.db(ClaimForm).insertMany([
    { name: 'September expenses', slug: `${ctx.org.slug}-sep-2026`, slugLower: `${ctx.org.slug}-sep-2026`, description: 'Travel, client meals and office purchases from September.', ...septWindow, status: 'closed', eligibility: 'all', eligibleEmployeeIds: [], categoryIds: categories.map((c) => c._id), requiresReceipt: true, maxClaimAmount: toPaise(25000), includeInPayroll: true, payrollYear: 2026, payrollMonth: 9, createdBy: ctx.users.hr_admin._id },
    { name: 'October expenses', slug: `${ctx.org.slug}-oct-2026`, slugLower: `${ctx.org.slug}-oct-2026`, description: 'File October travel, client meals and purchases here. Attach a receipt for each.', ...octWindow, status: 'open', eligibility: 'all', eligibleEmployeeIds: [], categoryIds: categories.map((c) => c._id), requiresReceipt: true, maxClaimAmount: toPaise(25000), includeInPayroll: true, payrollYear: 2026, payrollMonth: 10, createdBy: ctx.users.hr_admin._id },
  ])
  const who = (name: string) => by(people, name)?._id
  const reviewer = { reviewedBy: ctx.users.hr_admin._id, reviewedByName: ctx.users.hr_admin.name }
  const septClaims = [
    { name: 'Vikram Joshi', code: 'TRAVEL', date: '2026-09-08', amount: 2350, vendor: 'Uber', purpose: 'Cab to Sharma Organics for the kickoff', project: 'Sharma Organics' },
    { name: 'Karan Malhotra', code: 'SOFTWARE', date: '2026-09-12', amount: 2620, vendor: 'Canva', purpose: 'Canva Pro for campaign creatives', project: 'Urban Threads' },
    { name: 'Karan Malhotra', code: 'FOOD', date: '2026-09-19', amount: 1500, vendor: 'Barbeque Nation', purpose: 'Client lunch with Urban Threads', project: 'Urban Threads' },
  ]
  const octClaims: { name: string; code: string; date: string; amount: number; vendor: string; purpose: string; status: ClaimStatus; approved?: number; note?: string; cycle?: Id }[] = [
    { name: 'Ananya Kulkarni', code: 'TRAVEL', date: '2026-09-30', amount: 1840, vendor: 'Rapido', purpose: 'Shoot location recce, Koregaon Park', status: 'submitted' },
    { name: 'Ishaan Gupta', code: 'OFFICE', date: '2026-09-29', amount: 3299, vendor: 'Amazon', purpose: 'USB-C hub for the test devices', status: 'submitted' },
    { name: 'Pooja Desai', code: 'COURIER', date: '2026-09-27', amount: 640, vendor: 'Blue Dart', purpose: 'Signed contract to Patel Auto', status: 'approved', approved: 640 },
    { name: 'Meera Pillai', code: 'FOOD', date: '2026-09-26', amount: 2400, vendor: 'Third Wave Coffee', purpose: 'Design review with Nimbus Fintech', status: 'partially_approved', approved: 2000, note: 'Meals are capped at ₹2,000 a claim.' },
    { name: 'Harsh Vardhan', code: 'FUEL', date: '2026-09-24', amount: 1100, vendor: 'Indian Oil', purpose: 'Fuel for the Bhopal data-centre visit', status: 'scheduled_for_payroll', approved: 1100, cycle: octCycleId },
    { name: 'Sneha Banerjee', code: 'SOFTWARE', date: '2026-09-22', amount: 4999, vendor: 'Adobe', purpose: 'Personal Lightroom subscription', status: 'rejected', note: 'Personal subscriptions are not covered. The team plan has Lightroom.' },
  ]
  await ctx.db(Claim).insertMany([
    ...septClaims.filter((c) => who(c.name)).map((c) => ({ formId: septForm._id, employeeId: who(c.name), categoryId: cat(c.code), expenseDate: c.date, amountClaimed: toPaise(c.amount), amountApproved: toPaise(c.amount), vendor: c.vendor, purpose: c.purpose, project: c.project, paymentMethod: 'UPI', status: 'paid' as const, ...reviewer, reviewedAt: istInstant('2026-09-26', '12:00'), payrollCycleId: septCycleId, paidAt: istInstant('2026-09-30', '15:30'), paymentReference: 'HDFCR52026093012871' })),
    ...octClaims.filter((c) => who(c.name)).map((c) => ({
      formId: octForm._id, employeeId: who(c.name), categoryId: cat(c.code), expenseDate: c.date, amountClaimed: toPaise(c.amount), amountApproved: c.approved ? toPaise(c.approved) : null, vendor: c.vendor, purpose: c.purpose, paymentMethod: 'Personal card', status: c.status,
      ...(c.status === 'submitted' ? {} : { ...reviewer, reviewedAt: istInstant('2026-10-01', '11:30'), reviewNote: c.note }), payrollCycleId: c.cycle,
    })),
  ])
}

async function seedLetters(ctx: SeedCtx, people: Person[]) {
  const departments = new Map((await ctx.db(Department).find({}, { name: 1 }).lean()).map((d) => [String(d._id), d.name]))
  const structures = new Map((await ctx.db(SalaryStructure).find({ effectiveTo: null }).lean()).map((s) => [String(s.employeeId), s]))
  const prefix = orgPrefix(ctx.org)
  const plans: { name: string; code: string; issueDate: string; status: 'issued' | 'draft'; inputs: Record<string, string>; emailed?: boolean }[] = [
    { name: 'Manish Yadav', code: 'resignation_acceptance', issueDate: '2026-08-16', status: 'issued', inputs: { resignationDate: '2026-08-14', lastWorkingDay: '2026-09-15' }, emailed: true },
    { name: 'Manish Yadav', code: 'experience', issueDate: '2026-09-16', status: 'issued', inputs: { workUndertaken: 'Built the customer dashboard for Nimbus Fintech and led the move of three client sites to Next.js.' }, emailed: true },
    { name: 'Manish Yadav', code: 'relieving', issueDate: '2026-09-16', status: 'issued', inputs: { lastWorkingDay: '2026-09-15' } },
    { name: 'Kavya Reddy', code: 'appointment', issueDate: '2026-07-01', status: 'issued', inputs: { effectiveDate: '2026-07-01' }, emailed: true },
    { name: 'Rahul Chauhan', code: 'resignation_acceptance', issueDate: '2026-09-23', status: 'issued', inputs: { resignationDate: '2026-09-21', lastWorkingDay: '2026-10-20' } },
    { name: 'Siddharth Rao', code: 'confirmation', issueDate: '2026-10-01', status: 'draft', inputs: {} },
  ]
  const rows = plans.flatMap((plan, i) => {
    const e = by(people, plan.name)
    const definition = LETTERS_BY_CODE.get(plan.code)
    if (!e || !definition) return []
    const reference = letterReference(prefix, plan.issueDate.slice(0, 4), i + 1)
    const manager = e.managerId ? people.find((p) => String(p._id) === String(e.managerId))?.fullName : undefined
    const structure = structures.get(String(e._id))
    const variables = buildVariables(
      {
        employee: { fullName: e.fullName, code: e.code, workEmail: e.workEmail, designation: e.designation, department: e.departmentId ? departments.get(String(e.departmentId)) : undefined, manager, joinDate: e.joinDate, exitDate: e.exitDate, employmentType: e.employmentType, employmentTypeLabel: EMPLOYMENT_TYPE_LABEL[e.employmentType as EmploymentType] ?? e.employmentType, statusLabel: statusLabelOf(e.status), workLocation: e.workLocation },
        company: { name: ctx.org.name, address: '2nd Floor, Sapphire Tower, Vijay Nagar, Indore, Madhya Pradesh 452010' },
        letter: { reference, issueDate: plan.issueDate, signatoryName: ctx.users.hr_admin.name, signatoryDesignation: 'HR Manager' },
        salary: structure ? { monthlyGross: structure.monthlyGross, ctcAnnual: structure.ctcAnnual } : null,
        inputs: plan.inputs,
        today: todayIST(),
      },
      definition,
    )
    const issued = plan.status === 'issued'
    return [{
      employeeId: e._id, employeeName: e.fullName, templateCode: plan.code, templateName: definition.name, category: definition.category, referenceNumber: reference, issueDate: plan.issueDate,
      subject: renderTemplate(BODIES[plan.code].subject, variables), body: renderTemplate(BODIES[plan.code].body, variables), signatoryName: ctx.users.hr_admin.name, signatoryDesignation: 'HR Manager',
      inputs: plan.inputs, variables, statesPay: statesPay(definition, BODIES[plan.code]), status: plan.status, createdBy: ctx.users.hr_admin._id,
      ...(issued ? { issuedBy: ctx.users.hr_admin._id, issuedAt: istInstant(plan.issueDate, '12:00') } : {}),
      ...(plan.emailed ? { emailedAt: istInstant(plan.issueDate, '12:05') } : {}),
    }]
  })
  await ctx.db(Letter).insertMany(rows)
  for (const year of new Set(rows.map((r) => r.issueDate.slice(0, 4)))) await bumpSeq(ctx.orgId, `letter:${year}`, rows.length)
}

async function seedBankChanges(ctx: SeedCtx, people: Person[]) {
  const ananya = by(people, 'Ananya Kulkarni')
  const pooja = by(people, 'Pooja Desai')
  const newAccount = '50100427731'
  await ctx.db(BankChangeRequest).insertMany([
    ...(pooja ? [{ employeeId: pooja._id, employeeName: pooja.fullName, changedBySelf: true, previousMasked: 'XXXXXXXX4410', newMasked: maskAccount(pooja.bank?.accountNumber), newIfsc: pooja.bank?.ifsc, verifiedAt: istInstant('2026-08-20', '15:00'), verifiedBy: ctx.users.finance._id, verifiedByName: ctx.users.finance.name, createdAt: istInstant('2026-08-19', '10:00') }] : []),
    ...(ananya ? [{ employeeId: ananya._id, employeeName: ananya.fullName, changedBySelf: true, previousMasked: maskAccount(ananya.bank?.accountNumber), newMasked: maskAccount(newAccount), previousIfsc: ananya.bank?.ifsc, newIfsc: 'KKBK0005033' }] : []),
  ])
  if (ananya) await ctx.db(Employee).updateOne({ _id: ananya._id }, { $set: { 'bank.accountNumber': newAccount, 'bank.ifsc': 'KKBK0005033', 'bank.bankName': 'Kotak Mahindra Bank' } })
}
