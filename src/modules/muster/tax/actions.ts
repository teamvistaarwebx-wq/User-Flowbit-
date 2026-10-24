'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { todayIST } from '@/lib/dates'
import { saveUpload } from '@/lib/files'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { checkbox, isoDate, objectId, optionalText, paise, requiredText } from '@/lib/validation'
import { Employee } from '@/models/muster/Employee'
import { TaxDeclaration } from '@/models/muster/TaxDeclaration'
import { TaxYearSettings } from '@/models/muster/TaxYearSettings'
import { TdsOverride } from '@/models/muster/TdsOverride'
import { OWN_RECORD_REFUSAL } from '@/modules/muster/leave/approvals'
import { cycleLabel, getCycle } from '@/modules/muster/payroll/queries'
import { isLocked } from '@/modules/muster/payroll/stages'
import { mayDecideOwn, ownEmployeeId } from '@/modules/muster/people/scope'
import { DOCUMENT_MIME, MAX_DOCUMENT_BYTES } from '@/modules/muster/settings/defaults'
import { declarationWindow, proofWindow } from './windows'

const FY = z.string().regex(/^\d{4}-\d{2}$/, 'Choose a tax year')
const rupees = z.coerce.number({ error: 'Enter an amount in rupees' }).min(0, 'Cannot be negative').max(100_000_000, 'That is too large')
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/

const amountsSchema = z.object({
  sec80c: rupees.default(0),
  sec80dSelf: rupees.default(0),
  selfSenior: checkbox,
  sec80dParents: rupees.default(0),
  parentsSenior: checkbox,
  rentMonthly: rupees.default(0),
  metro: checkbox,
  landlordName: optionalText(120),
  landlordPan: z.string().trim().toUpperCase().max(10).optional().transform((v) => v || undefined).refine((v) => !v || PAN.test(v), 'Enter a valid PAN, like ABCPE1234F'),
  homeLoanInterest: rupees.default(0),
  nps80ccd1b: rupees.default(0),
  previousEmployer: z.object({ taxableSalary: rupees.default(0), tds: rupees.default(0), professionalTax: rupees.default(0) }).default({ taxableSalary: 0, tds: 0, professionalTax: 0 }),
})

const OPTS = { product: 'muster', feature: 'muster.payroll' } as const
const HR_OPTS = { ...OPTS, perm: 'payroll.run' } as const

function revalidateTax(employeeId?: string) {
  revalidatePath('/app/me/tax')
  revalidatePath('/app/hr/payroll/tax')
  if (employeeId) revalidatePath(`/app/hr/payroll/tax/${employeeId}`)
}

async function myEmployeeRecord(ctx: Parameters<Parameters<typeof action>[1]>[1]) {
  const own = ownEmployeeId(ctx)
  if (!own) return null
  return ctx.db(Employee).findOne({ _id: own, deletedAt: null }, { fullName: 1 }).lean()
}

/** Self-service: the regime and the investment declaration for a tax year, while the window is open. */
export const saveMyDeclaration = action(
  z.object({ fy: FY, regime: z.enum(['new', 'old']), declared: amountsSchema }),
  async ({ fy, regime, declared }, ctx) => {
    const me = await myEmployeeRecord(ctx)
    if (!me) return fail('Your account is not linked to an employee record. Ask HR to link it.')
    const [settings, current] = await Promise.all([ctx.db(TaxYearSettings).findOne({ fy }).lean(), ctx.db(TaxDeclaration).findOne({ fy, employeeId: me._id }, { proofStatus: 1 }).lean()])
    const window = declarationWindow(settings)
    if (!window.open) return fail(window.reason)
    if (current?.proofStatus === 'verified') return fail('HR has verified your proofs for this year, so the declaration is final. Ask HR if something changed.')
    await ctx.db(TaxDeclaration).updateOne({ fy, employeeId: me._id }, { $set: { regime, declared, submittedAt: new Date() } }, { upsert: true })
    await audit(ctx, { action: 'tax.declaration_saved', entity: 'Employee', entityId: me._id, summary: `${me.fullName} saved their ${fy} tax declaration (${regime} regime)`, product: 'muster', meta: { fy, regime } })
    revalidateTax(String(me._id))
    return ok(`Saved. Your TDS from the next payroll uses the ${regime} regime and these amounts.`)
  },
  OPTS,
)

/** Self-service: proofs for the declared investments, inside the proof window. HR is told. */
export const submitMyProofs = action(
  z.object({ fy: FY, note: optionalText(500), file: z.instanceof(File, { error: 'Choose a file to upload' }) }),
  async ({ fy, note, file }, ctx) => {
    const me = await myEmployeeRecord(ctx)
    if (!me) return fail('Your account is not linked to an employee record. Ask HR to link it.')
    const [settings, current] = await Promise.all([ctx.db(TaxYearSettings).findOne({ fy }).lean(), ctx.db(TaxDeclaration).findOne({ fy, employeeId: me._id }).lean()])
    const window = proofWindow(settings, todayIST())
    if (!window.open) return fail(window.reason)
    if (!current?.submittedAt) return fail('Save your declaration first, then upload proofs for it.')
    if (current.proofStatus === 'verified') return fail('HR has already verified your proofs for this year.')
    if (file.size > MAX_DOCUMENT_BYTES) return fail('That file is too large.', { file: 'Too large' })
    const stored = await saveUpload(ctx, file, { kind: 'tax_proof', entity: 'Employee', entityId: me._id, accept: DOCUMENT_MIME })
    if (!stored) return fail('Choose a file to upload.', { file: 'Choose a file' })
    await ctx.db(TaxDeclaration).updateOne(
      { _id: current._id },
      { $set: { proofStatus: 'submitted', proofSubmittedAt: new Date(), ...(note ? { proofNote: note } : {}) }, $push: { proofFiles: { fileId: stored._id, name: stored.name, uploadedAt: new Date() } } },
    )
    await audit(ctx, { action: 'tax.proof_submitted', entity: 'Employee', entityId: me._id, summary: `${me.fullName} uploaded a ${fy} investment proof`, product: 'muster', meta: { fy } })
    await notifyPermission(ctx, 'payroll.run', { title: `${me.fullName} uploaded tax proofs`, body: `Review them for ${fy}.`, href: `/app/hr/payroll/tax/${me._id}?fy=${fy}`, kind: 'info', product: 'muster', event: 'tax.proof_submitted' })
    revalidateTax(String(me._id))
    return ok('Proof uploaded. HR will verify it; until then your TDS uses the declared amounts.')
  },
  OPTS,
)

/** HR verifies proofs (the verified amounts then drive TDS) or sends them back with a note. */
export const reviewProofs = action(
  z.object({ fy: FY, employeeId: objectId, decision: z.enum(['verify', 'reject']), note: optionalText(500), verified: amountsSchema.optional() }),
  async ({ fy, employeeId, decision, note, verified }, ctx) => {
    if (employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const declaration = await ctx.db(TaxDeclaration).findOne({ fy, employeeId }).lean()
    if (!declaration) return fail('This person has not made a declaration for that year.')
    if (decision === 'reject' && !note) return fail('Say what is missing so they can fix it.', { note: 'Required when sending proofs back' })
    const set = decision === 'verify'
      ? { proofStatus: 'verified', verified: verified ?? declaration.declared, reviewNote: note, reviewedAt: new Date(), reviewedBy: ctx.userId, reviewedByName: ctx.user.name }
      : { proofStatus: 'rejected', reviewNote: note, reviewedAt: new Date(), reviewedBy: ctx.userId, reviewedByName: ctx.user.name }
    await ctx.db(TaxDeclaration).updateOne({ _id: declaration._id }, { $set: set })
    await audit(ctx, { action: decision === 'verify' ? 'tax.proofs_verified' : 'tax.proofs_rejected', entity: 'Employee', entityId: employeeId, summary: `${decision === 'verify' ? 'Verified' : 'Sent back'} ${fy} tax proofs`, product: 'muster', meta: { fy, note } })
    revalidateTax(employeeId)
    return ok(decision === 'verify' ? 'Proofs verified. TDS uses the verified amounts from the next payroll run.' : 'Proofs sent back with your note.')
  },
  HR_OPTS,
)

/** HR: the year's windows, the TAN and the Form 130 signatory. */
export const saveTaxYearSettings = action(
  z.object({
    fy: FY,
    declarationsOpen: checkbox,
    proofOpens: isoDate.optional().or(z.literal('').transform(() => undefined)),
    proofCloses: isoDate.optional().or(z.literal('').transform(() => undefined)),
    tan: z.string().trim().toUpperCase().max(10).optional().transform((v) => v || undefined).refine((v) => !v || /^[A-Z]{4}\d{5}[A-Z]$/.test(v), 'Enter a valid TAN, like BPLA12345B'),
    signatoryName: optionalText(120),
    signatoryDesignation: optionalText(120),
    signatoryPlace: optionalText(80),
  }),
  async (input, ctx) => {
    if (input.proofOpens && input.proofCloses && input.proofCloses < input.proofOpens) return fail('The proof window must close after it opens.', { proofCloses: 'After the opening date' })
    const signatory = { name: input.signatoryName, designation: input.signatoryDesignation, place: input.signatoryPlace }
    await ctx.db(TaxYearSettings).updateOne(
      { fy: input.fy },
      { $set: { declarationsOpen: input.declarationsOpen, proofOpens: input.proofOpens, proofCloses: input.proofCloses, tan: input.tan, signatory, updatedBy: ctx.userId } },
      { upsert: true },
    )
    await audit(ctx, { action: 'tax.year_settings_saved', entity: 'Org', entityId: ctx.orgId, summary: `Saved ${input.fy} salary tax settings`, product: 'muster', meta: { fy: input.fy, declarationsOpen: input.declarationsOpen, proofOpens: input.proofOpens, proofCloses: input.proofCloses } })
    revalidateTax()
    return ok('Tax year settings saved.')
  },
  HR_OPTS,
)

async function unlockedCycle(ctx: Parameters<typeof getCycle>[0], id: string) {
  const cycle = await getCycle(ctx, id)
  if (!cycle) return { cycle: null, refusal: 'That payroll month was not found.' }
  if (isLocked(cycle.status)) return { cycle, refusal: `${cycleLabel(cycle)} payroll is locked. Reopen it before changing anyone's TDS.` }
  return { cycle, refusal: null }
}

/** Finance replaces this month's computed TDS for one person, with a reason. */
export const setTdsOverride = action(
  z.object({ id: objectId, employeeId: objectId, amount: paise, reason: requiredText('Reason', 300) }),
  async ({ id, employeeId, amount, reason }, ctx) => {
    const { cycle, refusal } = await unlockedCycle(ctx, id)
    if (refusal || !cycle) return fail(refusal ?? 'Not found')
    if (employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const employee = await ctx.db(Employee).findById(employeeId, { fullName: 1 }).lean()
    if (!employee) return fail('That employee was not found.')
    await ctx.db(TdsOverride).updateMany({ cycleId: cycle._id, employeeId, voidedAt: null }, { $set: { voidedAt: new Date(), voidedBy: ctx.userId } })
    await ctx.db(TdsOverride).create({ cycleId: cycle._id, employeeId, amount, reason, createdBy: ctx.userId, createdByName: ctx.user.name })
    await audit(ctx, { action: 'tax.tds_overridden', entity: 'Employee', entityId: employeeId, summary: `TDS for ${employee.fullName}, ${cycleLabel(cycle)} set to ${formatINR(amount)}`, product: 'muster', meta: { reason, cycleId: id } })
    revalidatePath(`/app/hr/payroll/${id}`)
    return ok(`${employee.fullName}'s TDS for ${cycleLabel(cycle)} will be ${formatINR(amount)}. Regenerate payroll to apply it.`)
  },
  HR_OPTS,
)

export const clearTdsOverride = action(
  z.object({ id: objectId, employeeId: objectId }),
  async ({ id, employeeId }, ctx) => {
    const { cycle, refusal } = await unlockedCycle(ctx, id)
    if (refusal || !cycle) return fail(refusal ?? 'Not found')
    if (employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const res = await ctx.db(TdsOverride).updateMany({ cycleId: cycle._id, employeeId, voidedAt: null }, { $set: { voidedAt: new Date(), voidedBy: ctx.userId } })
    if (!res.modifiedCount) return fail('There was no override to remove.')
    await audit(ctx, { action: 'tax.tds_override_removed', entity: 'Employee', entityId: employeeId, summary: `Removed the TDS override for ${cycleLabel(cycle)}`, product: 'muster', meta: { cycleId: id } })
    revalidatePath(`/app/hr/payroll/${id}`)
    return ok('Override removed. Regenerate payroll to go back to the computed TDS.')
  },
  HR_OPTS,
)
