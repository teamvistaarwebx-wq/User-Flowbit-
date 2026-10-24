'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { withTransaction } from '@/lib/db'
import { todayIST } from '@/lib/dates'
import { notifyPermission } from '@/lib/notify'
import { email, ifsc, isoDate, pan, phone, requiredText } from '@/lib/validation'
import { BankChangeRequest } from '@/models/muster/BankChangeRequest'
import { Employee } from '@/models/muster/Employee'
import { maskAccount } from '@/modules/muster/payroll/money'
import { accountNumber, birthDateProblem, uan } from '@/modules/muster/people/validation'
import { ownEmployeeId } from '@/modules/muster/people/scope'
import { CORRECTABLE_FIELDS, changedDetails, detailsRefusedMessage, detailsSavedMessage, type DetailValues } from './details'

const NOT_LINKED = 'Your account is not linked to an employee record. Ask HR to link it.'

/** Every field is optional: a field left blank or not posted keeps its value. */
const detailsSchema = z.object({
  personalEmail: email.optional(),
  phone: phone.optional(),
  dob: isoDate.optional(),
  address: z.string().trim().max(400, 'Keep the address under 400 characters').optional(),
  emergencyName: z.string().trim().max(120).optional(),
  emergencyPhone: phone.optional(),
  emergencyRelation: z.string().trim().max(60).optional(),
  pan: pan.optional(),
  uan: uan.optional(),
  bankName: z.string().trim().max(120).optional(),
  accountName: z.string().trim().max(120).optional(),
  accountNumber: accountNumber.optional(),
  ifsc: ifsc.optional(),
})

export const updateMyDetails = action(
  z.unknown(),
  async (raw, ctx) => {
    const own = ownEmployeeId(ctx)
    if (!own) return fail(NOT_LINKED)
    const parsed = detailsSchema.safeParse(raw)
    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]))
      return fail(detailsRefusedMessage(fieldErrors), fieldErrors)
    }
    const input = parsed.data
    if (input.dob) {
      const problem = birthDateProblem(input.dob, todayIST())
      if (problem) return fail(problem, { dob: problem })
    }
    const employee = await ctx.db(Employee).findById(own).lean()
    if (!employee) return fail(NOT_LINKED)

    const before: DetailValues = {
      personalEmail: employee.personalEmail ?? '', phone: employee.phone ?? '', dob: employee.dob ?? '', address: employee.address?.text ?? '',
      emergencyName: employee.emergencyContact?.name ?? '', emergencyPhone: employee.emergencyContact?.phone ?? '', emergencyRelation: employee.emergencyContact?.relation ?? '',
      pan: employee.pan ?? '', uan: employee.uan ?? '', bankName: employee.bank?.bankName ?? '', accountName: employee.bank?.accountName ?? '', accountNumber: employee.bank?.accountNumber ?? '', ifsc: employee.bank?.ifsc ?? '',
    }
    const after: DetailValues = { ...before, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== '')) }
    const changed = changedDetails(before, after)
    if (!changed.length) return ok(detailsSavedMessage([]))

    const bankChanged = changed.includes('accountNumber') || changed.includes('ifsc')
    const set = {
      personalEmail: after.personalEmail || undefined,
      phone: after.phone || undefined,
      dob: after.dob || undefined,
      'address.text': after.address ?? '',
      'emergencyContact.name': after.emergencyName ?? '',
      'emergencyContact.phone': after.emergencyPhone ?? '',
      'emergencyContact.relation': after.emergencyRelation ?? '',
      pan: after.pan || undefined,
      uan: after.uan || undefined,
      'bank.bankName': after.bankName ?? '',
      'bank.accountName': after.accountName ?? '',
      'bank.accountNumber': after.accountNumber ?? '',
      'bank.ifsc': after.ifsc ?? '',
    }
    const bankChangeId = await withTransaction(async (session) => {
      await ctx.db(Employee).updateOne({ _id: employee._id }, { $set: set }, { session })
      if (bankChanged) {
        const change = await ctx.db(BankChangeRequest).create(
          { employeeId: employee._id, employeeName: employee.fullName, changedBy: ctx.userId, changedBySelf: true, previousMasked: maskAccount(before.accountNumber), newMasked: maskAccount(after.accountNumber), previousIfsc: before.ifsc, newIfsc: after.ifsc },
          { session },
        )
        return String(change._id)
      }
      return null
    })
    await audit(ctx, { action: 'employee.updated_self', entity: 'Employee', entityId: employee._id, summary: `${employee.fullName} updated their own details (${changed.length} field${changed.length === 1 ? '' : 's'})`, product: 'muster', changes: { before, after, redactIds: true } })
    if (bankChanged) {
      await audit(ctx, { action: 'employee.bank_changed_self', entity: 'Employee', entityId: employee._id, summary: `${employee.fullName} changed their own bank account to ${maskAccount(after.accountNumber)}`, product: 'muster' })
      await notifyPermission(ctx, 'people.read_sensitive', { title: `${employee.fullName} changed their bank account`, body: 'Verify it before the next payroll run.', href: `/app/hr/people/${employee._id}`, kind: 'approval', product: 'muster', event: 'employee.bank_changed', ...(bankChangeId ? { action: { kind: 'bank_change' as const, id: bankChangeId } } : {}) })
    }
    revalidatePath('/app/me')
    return ok(detailsSavedMessage(changed))
  },
  { product: 'muster', localise: true },
)

export const askHrToCorrect = action(
  z.object({ field: z.enum(CORRECTABLE_FIELDS, { error: 'Choose what is wrong' }), correction: requiredText('What it should say', 500) }),
  async ({ field, correction }, ctx) => {
    const own = ownEmployeeId(ctx)
    if (!own) return fail(NOT_LINKED)
    const employee = await ctx.db(Employee).findById(own, { fullName: 1 }).lean()
    if (!employee) return fail(NOT_LINKED)
    const sent = await notifyPermission(ctx, 'people.write', { title: `${employee.fullName} asked HR to correct their ${field.toLowerCase()}`, body: correction, href: `/app/hr/people/${employee._id}`, kind: 'approval', product: 'muster', event: 'employee.change_requested' })
    await audit(ctx, { action: 'employee.change_requested', entity: 'Employee', entityId: employee._id, summary: `${employee.fullName} asked HR to correct their ${field.toLowerCase()}`, product: 'muster', meta: { field, correction } })
    if (!sent) return fail('Nobody in HR could be reached in Flowbit. Tell HR directly.')
    return ok(`Sent to HR: your ${field.toLowerCase()} should say "${correction}". They change it on your record and you see it here.`)
  },
  { product: 'muster', localise: true },
)
