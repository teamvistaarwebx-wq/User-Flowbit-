'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { saveUpload } from '@/lib/files'
import { notifyPermission } from '@/lib/notify'
import { optionalText } from '@/lib/validation'
import { Employee } from '@/models/muster/Employee'
import { EmployeeDocument } from '@/models/muster/EmployeeDocument'
import { onboardingFor } from '@/modules/muster/people/onboarding-gate'
import { ownEmployeeId } from '@/modules/muster/people/scope'
import { docLabel, DOCUMENT_MIME, DOCUMENT_TOO_LARGE, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '@/modules/muster/settings/defaults'

/** Self-service: the signed-in person files one of their own joining documents. HR is told. */
export const uploadMyDocument = action(
  z.object({ docType: z.enum(DOCUMENT_TYPES, { error: 'Choose a document type' }), notes: optionalText(300), file: z.instanceof(File, { error: 'Choose a file to upload' }) }),
  async (input, ctx) => {
    const own = ownEmployeeId(ctx)
    if (!own) return fail('Your account is not linked to an employee record. Ask HR to link it.')
    const employee = await ctx.db(Employee).findOne({ _id: own, deletedAt: null }, { fullName: 1 }).lean()
    if (!employee) return fail('Your account is not linked to an employee record. Ask HR to link it.')
    if (input.file.size > MAX_DOCUMENT_BYTES) return fail(DOCUMENT_TOO_LARGE, { file: 'Too large' })
    const stored = await saveUpload(ctx, input.file, { kind: 'employee_document', entity: 'Employee', entityId: employee._id, accept: DOCUMENT_MIME })
    if (!stored) return fail('Choose a file to upload.', { file: 'Choose a file' })
    await ctx.db(EmployeeDocument).create({
      employeeId: employee._id, docType: input.docType, fileId: stored._id, fileName: stored.name, mimeType: stored.mime, sizeBytes: stored.size,
      notes: input.notes, uploadedBy: ctx.userId, uploadedByName: ctx.user.name,
    })
    const label = docLabel(input.docType)
    const status = await onboardingFor(ctx, employee._id)
    await audit(ctx, { action: 'employee.document_filed_self', entity: 'Employee', entityId: employee._id, summary: `${employee.fullName} uploaded their ${label}`, product: 'muster', meta: { percent: status.percent } })
    await notifyPermission(ctx, 'people.write', { title: `${employee.fullName} uploaded their ${label}`, body: `Onboarding is ${status.percent}% complete.`, href: `/app/hr/people/${employee._id}?tab=documents`, kind: 'info', product: 'muster', event: 'employee.document_uploaded' })
    revalidatePath('/app/me/documents')
    revalidatePath(`/app/hr/people/${employee._id}`)
    return ok(`${label} uploaded. Onboarding is ${status.percent}% complete.`)
  },
  { product: 'muster' },
)
