import { z } from 'zod'
import { checkbox, email, ifsc, isoDate, objectId, optionalText, pan, phone } from '@/lib/validation'
import { addDays, todayIST } from '@/lib/dates'
import { BIOMETRIC_ID_HINT, BIOMETRIC_ID_PATTERN } from '../attendance/biometric/mapping'
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, WORK_MODES } from './lifecycle'

/** Employee form validation (pure). */

export const UAN_PATTERN = /^\d{12}$/
export const AADHAAR_PATTERN = /^\d{12}$/
export const ESIC_PATTERN = /^\d{10,17}$/

const digits = (label: string, pattern: RegExp, example: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ''))
    .refine((v) => pattern.test(v), `${label}: use the format ${example}`)

export const uan = digits('UAN', UAN_PATTERN, '12 digits')
export const aadhaar = digits('Aadhaar', AADHAAR_PATTERN, '12 digits')
export const esic = digits('ESIC number', ESIC_PATTERN, '10 to 17 digits')
export const accountNumber = digits('Account number', /^\d{6,20}$/, '6 to 20 digits')

/** Age and range checks for a date of birth. */
export function birthDateProblem(dob: string, today: string): string | null {
  if (dob > today) return 'A date of birth cannot be in the future.'
  if (dob < '1900-01-01') return 'Check the year: that is before 1900.'
  const fourteenth = `${Number(dob.slice(0, 4)) + 14}${dob.slice(4)}`
  if (fourteenth > today) return 'That would make them younger than 14. Check the year.'
  return null
}

export const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/)
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' '), fullName: parts.join(' ') }
}

const optionalDate = isoDate.optional()

export const employeeSchema = z
  .object({
    code: z.string().trim().max(32, 'Use at most 32 characters').optional(),
    fullName: z.string({ error: 'Full name is required' }).trim().min(2, 'Enter the full name').max(120, 'Use at most 120 characters'),
    workEmail: email,
    personalEmail: email.optional(),
    phone: phone.optional(),
    gender: z.enum(['female', 'male', 'other', 'undisclosed']).optional(),
    dob: optionalDate,
    address: optionalText(400),
    departmentId: objectId.optional(),
    designationId: objectId.optional(),
    managerId: objectId.optional(),
    workLocation: optionalText(120),
    /** Absent leaves the stored work mode as it is. */
    workMode: z.enum(WORK_MODES, { error: 'Choose office or remote' }).optional(),
    /** The user id on the biometric attendance device; blank means the device uses the employee code. */
    biometricId: z.string().trim().regex(BIOMETRIC_ID_PATTERN, BIOMETRIC_ID_HINT).optional(),
    employmentType: z.enum(EMPLOYMENT_TYPES, { error: 'Choose an employment type' }),
    status: z.enum(EMPLOYEE_STATUSES, { error: 'Choose a status' }),
    joinDate: isoDate,
    originalJoiningDate: optionalDate,
    probationEndDate: optionalDate,
    exitDate: optionalDate,
    exitReason: optionalText(500),
    resignationDate: optionalDate,
    noticePeriodDays: z.coerce.number().int('Use a whole number').min(0, 'Use 0–365').max(365, 'Use 0–365').optional(),
    ptState: z.string().trim().toUpperCase().length(2, 'Choose a state').optional(),
    pfCovered: checkbox,
    esiCovered: checkbox,
    ptExempt: checkbox,
    isOvertimeEligible: checkbox,
    /** Present when the sensitive block was on the form. */
    sensitive: checkbox,
    pan: pan.optional(),
    uan: uan.optional(),
    aadhaar: aadhaar.optional(),
    pfAccountNumber: optionalText(40),
    esicNumber: esic.optional(),
    bank: z
      .object({ bankName: optionalText(80), accountName: optionalText(120), accountNumber: accountNumber.optional(), ifsc: ifsc.optional() })
      .optional(),
    emergencyContact: z.object({ name: optionalText(120), phone: phone.optional(), relation: optionalText(60) }).optional(),
    notes: optionalText(2000),
    /** An HR admin's reason for starting someone before their joining documents are in. */
    onboardingOverride: optionalText(300),
    today: isoDate.optional(),
  })
  .superRefine((v, ctx) => {
    const today = v.today ?? todayIST()
    if (v.dob) {
      const problem = birthDateProblem(v.dob, today)
      if (problem) ctx.addIssue({ code: 'custom', path: ['dob'], message: problem })
    }
    if (v.joinDate > addDays(today, 366)) ctx.addIssue({ code: 'custom', path: ['joinDate'], message: 'A joining date can be at most a year ahead.' })
    if (v.exitDate && v.exitDate < v.joinDate) ctx.addIssue({ code: 'custom', path: ['exitDate'], message: 'The last working day cannot be before the joining date.' })
    if (v.originalJoiningDate && v.originalJoiningDate > v.joinDate) ctx.addIssue({ code: 'custom', path: ['originalJoiningDate'], message: 'Continuous service starts on or before the joining date.' })
    if (v.bank?.accountNumber && !v.bank.ifsc) ctx.addIssue({ code: 'custom', path: ['bank.ifsc'], message: 'An account number without an IFSC cannot be paid.' })
  })

export type EmployeeInput = z.output<typeof employeeSchema>

/** The sensitive part of the input as a $set patch (blank = cleared). */
export function sensitivePatch(v: EmployeeInput) {
  return {
    pan: v.pan ?? null,
    uan: v.uan ?? null,
    aadhaar: v.aadhaar ?? null,
    pfAccountNumber: v.pfAccountNumber ?? null,
    esicNumber: v.esicNumber ?? null,
    bank: { bankName: v.bank?.bankName ?? null, accountName: v.bank?.accountName ?? null, accountNumber: v.bank?.accountNumber ?? null, ifsc: v.bank?.ifsc ?? null },
  }
}

/** "That work email already belongs to Aditi Singh. Use a different one." */
export function duplicateRefusal(field: 'code' | 'workEmail', holder: { fullName: string; inDirectory: boolean }): { message: string; field: string } {
  const label = field === 'code' ? 'employee code' : 'work email'
  const who = holder.inDirectory ? holder.fullName : `${holder.fullName}, who is no longer in the directory`
  return { field, message: `That ${label} already belongs to ${who}. Use a different one.` }
}
