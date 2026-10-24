'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDate, todayIST } from '@/lib/dates'
import { NotFoundError } from '@/lib/errors'
import { saveUpload } from '@/lib/files'
import { notifyMembers } from '@/lib/notify'
import { isoDate, objectId, optionalText, phone, requiredText } from '@/lib/validation'
import { Employee } from '@/models/muster/Employee'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { EmployeeRemark } from '@/models/muster/EmployeeRemark'
import { Nominee, NOMINEE_SCHEMES } from '@/models/muster/Nominee'
import { docLabel, DOCUMENT_MIME, DOCUMENT_TOO_LARGE, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, NOMINEE_SCHEME_LABEL, REMARK_KIND_LABEL } from '../settings/defaults'
import { OWN_RECORD_REFUSAL } from '../leave/approvals'
import { isSharedWithEmployee, notifiesEmployee, REMARK_FORM_KINDS } from './remarks'
import { assertVisible, mayDecideOwn, ownEmployeeId } from './scope'

const archiveSchema = z.object({ id: objectId, reason: requiredText('Reason', 300) })
const profile = (employeeId: unknown) => `/app/hr/people/${String(employeeId)}`

async function employeeOf(ctx: Parameters<typeof assertVisible>[0], id: string) {
  await assertVisible(ctx, id)
  const employee = await ctx.db(Employee).findById(id, { fullName: 1, memberId: 1 }).lean()
  if (!employee) throw new NotFoundError('That employee')
  return employee
}

export const uploadEmployeeDocument = action(
  z.object({ employeeId: objectId, docType: z.enum(DOCUMENT_TYPES, { error: 'Choose a document type' }), notes: optionalText(300), expiresOn: z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional()), file: z.instanceof(File, { error: 'Choose a file to upload' }) }),
  async (input, ctx) => {
    const employee = await employeeOf(ctx, input.employeeId)
    if (input.file.size > MAX_DOCUMENT_BYTES) return fail(DOCUMENT_TOO_LARGE, { file: 'Too large' })
    const stored = await saveUpload(ctx, input.file, { kind: 'employee_document', entity: 'Employee', entityId: employee._id, accept: DOCUMENT_MIME })
    if (!stored) return fail('Choose a file to upload.', { file: 'Choose a file' })
    await ctx.db(EmployeeDocument).create({
      employeeId: employee._id, docType: input.docType, fileId: stored._id, fileName: stored.name, mimeType: stored.mime, sizeBytes: stored.size,
      notes: input.notes, expiresOn: input.expiresOn, uploadedBy: ctx.userId, uploadedByName: ctx.user.name,
    })
    await audit(ctx, { action: 'employee.document_filed', entity: 'Employee', entityId: employee._id, summary: `Filed ${docLabel(input.docType)} for ${employee.fullName}`, product: 'muster' })
    revalidatePath(profile(employee._id))
    return ok(`${docLabel(input.docType)} filed for ${employee.fullName}.`)
  },
  { product: 'muster', perm: 'people.write' },
)

export const archiveEmployeeDocument = action(
  archiveSchema,
  async ({ id, reason }, ctx) => {
    const doc = await ctx.db(EmployeeDocument).findOne({ _id: id, deletedAt: null }).lean()
    if (!doc) throw new NotFoundError('That document')
    const employee = await employeeOf(ctx, String(doc.employeeId))
    await ctx.db(EmployeeDocument).updateOne({ _id: id }, { $set: { deletedAt: new Date(), deletedReason: reason } })
    await audit(ctx, { action: 'employee.document_archived', entity: 'Employee', entityId: employee._id, summary: `Archived ${doc.docType} for ${employee.fullName}`, product: 'muster', meta: { reason } })
    revalidatePath(profile(employee._id))
    return ok(`${doc.docType} archived. It stays in the audit trail.`)
  },
  { product: 'muster', perm: 'people.write' },
)

const nomineeSchema = z.object({
  employeeId: objectId,
  scheme: z.enum(NOMINEE_SCHEMES),
  name: z.string().trim().min(2, 'Enter the nominee’s name').max(120),
  relationship: z.string().trim().min(2, 'Enter the relationship').max(60),
  dob: isoDate.optional(),
  sharePercent: z.coerce.number({ error: 'Enter a share' }).min(0.01, 'At least 0.01%').max(100, 'At most 100%'),
  phone: phone.optional(),
  address: optionalText(400),
  effectiveFrom: isoDate,
})

export const addNominee = action(
  nomineeSchema,
  async (input, ctx) => {
    ctx.assert('people.read_sensitive')
    const employee = await employeeOf(ctx, input.employeeId)
    if (input.dob && input.dob > todayIST()) return fail('A date of birth cannot be in the future.', { dob: 'In the future' })
    const live = await ctx.db(Nominee).find({ employeeId: employee._id, scheme: input.scheme, deletedAt: null }, { sharePercent: 1 }).lean()
    const allocated = Math.round(live.reduce((sum, n) => sum + n.sharePercent, 0) * 100) / 100
    const scheme = NOMINEE_SCHEME_LABEL[input.scheme]
    if (allocated + input.sharePercent > 100.001) {
      const left = Math.max(0, Math.round((100 - allocated) * 100) / 100)
      const message = `That would take the ${scheme} shares to ${Math.round((allocated + input.sharePercent) * 100) / 100}%. ${allocated}% is already allocated, so at most ${left}% is left.`
      return fail(message, { sharePercent: message })
    }
    await ctx.db(Nominee).create({ ...input, employeeId: employee._id, recordedBy: ctx.userId })
    await audit(ctx, { action: 'employee.nominee_added', entity: 'Employee', entityId: employee._id, summary: `Added ${scheme} nominee for ${employee.fullName}`, product: 'muster' })
    revalidatePath(profile(employee._id))
    return ok(`${input.name} added as ${scheme} nominee, ${input.sharePercent}%.`)
  },
  { product: 'muster', perm: 'people.write' },
)

export const archiveNominee = action(
  archiveSchema,
  async ({ id, reason }, ctx) => {
    ctx.assert('people.read_sensitive')
    const nominee = await ctx.db(Nominee).findOne({ _id: id, deletedAt: null }).lean()
    if (!nominee) throw new NotFoundError('That nomination')
    const employee = await employeeOf(ctx, String(nominee.employeeId))
    await ctx.db(Nominee).updateOne({ _id: id }, { $set: { deletedAt: new Date(), deletedReason: reason } })
    await audit(ctx, { action: 'employee.nominee_removed', entity: 'Employee', entityId: employee._id, summary: `Removed ${nominee.name} as nominee for ${employee.fullName}`, product: 'muster', meta: { reason } })
    revalidatePath(profile(employee._id))
    return ok(`${nominee.name} removed as nominee.`)
  },
  { product: 'muster', perm: 'people.write' },
)

export const addRemark = action(
  z.object({
    employeeId: objectId,
    kind: z.enum(REMARK_FORM_KINDS, { error: 'Choose a type' }),
    occurredOn: isoDate,
    body: z.string().trim().min(3, 'Write at least a few words').max(4000, 'Keep it under 4,000 characters'),
  }),
  async (input, ctx) => {
    if (input.employeeId === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) return fail(OWN_RECORD_REFUSAL)
    const employee = await employeeOf(ctx, input.employeeId)
    if (input.occurredOn > todayIST()) return fail('A remark is about something that already happened.', { occurredOn: 'In the future' })
    const shared = isSharedWithEmployee(input.kind)
    await ctx.db(EmployeeRemark).create({ ...input, employeeId: employee._id, authorId: ctx.userId, authorName: ctx.user.name, visibleToEmployee: shared })
    await audit(ctx, { action: 'employee.remark_added', entity: 'Employee', entityId: employee._id, summary: `Added a ${REMARK_KIND_LABEL[input.kind].toLowerCase()} for ${employee.fullName} (${formatDate(input.occurredOn)})`, product: 'muster', meta: { kind: input.kind, visibleToEmployee: shared } })
    if (notifiesEmployee(input.kind) && employee.memberId) {
      await notifyMembers(ctx, [employee.memberId], { title: `Notes from your one-on-one on ${formatDate(input.occurredOn)}`, body: `Added by ${ctx.user.name}.`, href: '/app/me', kind: 'info', product: 'muster', event: 'employee.one_on_one_noted' })
    }
    revalidatePath(profile(employee._id))
    revalidatePath('/app/me')
    return ok(`Remark saved for ${employee.fullName}${shared ? `; they can read it in self-service` : '; only HR can see it'}.`)
  },
  { product: 'muster', perm: 'people.write' },
)

export const archiveRemark = action(
  archiveSchema,
  async ({ id, reason }, ctx) => {
    const remark = await ctx.db(EmployeeRemark).findOne({ _id: id, deletedAt: null }).lean()
    if (!remark) throw new NotFoundError('That remark')
    if (String(remark.employeeId) === ownEmployeeId(ctx) && !mayDecideOwn(ctx)) throw new NotFoundError('That remark')
    const employee = await employeeOf(ctx, String(remark.employeeId))
    await ctx.db(EmployeeRemark).updateOne({ _id: id }, { $set: { deletedAt: new Date(), deletedReason: reason } })
    await audit(ctx, { action: 'employee.remark_removed', entity: 'Employee', entityId: employee._id, summary: `Removed a remark for ${employee.fullName}`, product: 'muster', meta: { reason } })
    revalidatePath(profile(employee._id))
    revalidatePath('/app/me')
    return ok('Remark removed. It stays in the audit trail.')
  },
  { product: 'muster', perm: 'people.write' },
)
