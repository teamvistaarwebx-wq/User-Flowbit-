import { z } from 'zod'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/upload-limit'

/** Muster defaults (pure): policy values and the standard leave types. */

/**
 * Document types on an employee's record. The stored value stays stable;
 * DOCUMENT_LABEL is what people read.
 */
export const DOCUMENT_TYPES = [
  'Aadhaar Card', 'PAN card', '10th Marksheet', '12th Marksheet', 'Graduation Marksheet', 'Bank Passbook', 'Post-Graduation Marksheet',
  'Previous Employment Relieving Letter', 'Previous Employment Certificate', 'Photograph', 'Signed offer letter',
  'Signed employee agreement', 'Nomination form', 'Medical', 'Other',
] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

const DOCUMENT_LABEL: Partial<Record<string, string>> = {
  'Aadhaar Card': 'Aadhaar card',
  '10th Marksheet': '10th marksheet',
  '12th Marksheet': '12th marksheet',
  'Graduation Marksheet': 'College marksheet / degree',
  'Post-Graduation Marksheet': 'Post-graduation marksheet / degree',
  'Bank Passbook': 'Bank passbook or cancelled cheque',
}
export const docLabel = (type: string): string => DOCUMENT_LABEL[type] ?? type

/** Files an employee document may be, and how large. */
export const DOCUMENT_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
export const MAX_DOCUMENT_BYTES = MAX_UPLOAD_BYTES
export const DOCUMENT_TOO_LARGE = `Documents must be ${MAX_UPLOAD_LABEL} or smaller. Scan it at a lower resolution, or compress the PDF.`

/** Mandatory joining documents until HR changes them in settings. */
export const DEFAULT_MANDATORY_DOCUMENTS: readonly DocumentType[] = ['Aadhaar Card', 'PAN card', '10th Marksheet', '12th Marksheet', 'Graduation Marksheet', 'Bank Passbook']
/** A joiner needs this share of the mandatory documents on file before they can start. */
export const DEFAULT_ONBOARDING_THRESHOLD = 60

export const policySchema = z.object({
  attendance: z
    .object({
      unmarkedPolicy: z.enum(['present', 'absent', 'pending']).catch('present'),
      correctionWindowHours: z.number().int().min(1).max(8760).catch(360),
      compOffValidDays: z.number().int().min(0).max(365).catch(90),
    })
    .catch({ unmarkedPolicy: 'present', correctionWindowHours: 360, compOffValidDays: 90 }),
  leave: z
    .object({
      leaveYearStartMonth: z.number().int().min(1).max(12).catch(4),
      carryForwardPercent: z.number().min(0).max(100).catch(50),
      allowNegativeBalance: z.boolean().catch(false),
    })
    .catch({ leaveYearStartMonth: 4, carryForwardPercent: 50, allowNegativeBalance: false }),
  notice: z
    .object({
      internDays: z.number().int().min(0).max(365).catch(7),
      probationDays: z.number().int().min(0).max(365).catch(30),
      confirmedDays: z.number().int().min(0).max(365).catch(90),
    })
    .catch({ internDays: 7, probationDays: 30, confirmedDays: 90 }),
  onboarding: z
    .object({
      mandatoryDocuments: z
        .array(z.string())
        .transform((list) => DOCUMENT_TYPES.filter((t) => list.includes(t)))
        .catch([...DEFAULT_MANDATORY_DOCUMENTS]),
      thresholdPercent: z.number().int().min(0).max(100).catch(DEFAULT_ONBOARDING_THRESHOLD),
    })
    .catch({ mandatoryDocuments: [...DEFAULT_MANDATORY_DOCUMENTS], thresholdPercent: DEFAULT_ONBOARDING_THRESHOLD }),
  /** Letter type code → company signatory id (Muster settings → Letter signatories). */
  letterSignatories: z
    .record(z.string(), z.unknown())
    .transform((map) => Object.fromEntries(Object.entries(map).filter((e): e is [string, string] => typeof e[1] === 'string' && /^[a-f\d]{24}$/i.test(e[1]))))
    .catch({}),
})

export type Policy = z.output<typeof policySchema>

export const DEFAULT_POLICY: Policy = policySchema.parse({})

/** A stored (possibly partial or malformed) policy document → a complete policy. */
export const readPolicy = (doc: unknown): Policy => policySchema.parse(doc ?? {})

export const UNMARKED_POLICY_COPY: Record<Policy['attendance']['unmarkedPolicy'], string> = {
  pending: 'An unmarked day is not treated as worked. The month cannot be locked until every day has been marked.',
  present: 'An unmarked working day is paid as present when the month is locked, on an assumption rather than a record.',
  absent: 'An unmarked working day counts as absent when the month is locked, and costs a day’s pay.',
}

export type StandardLeaveType = {
  code: string
  name: string
  isPaid: boolean
  annualQuota: number
  accrualModel: 'monthly' | 'annual' | 'service_year' | 'on_application'
  accrualPerMonth: number
  carryForwardCap: number | null
  proofRequiredAfterDays: number | null
  allowHalfDay: boolean
  requiresProof: boolean
  displayOrder: number
}

export const STANDARD_LEAVE_TYPES: StandardLeaveType[] = [
  { code: 'PL', name: 'Paid Leave', isPaid: true, annualQuota: 12, accrualModel: 'monthly', accrualPerMonth: 1, carryForwardCap: 30, proofRequiredAfterDays: null, allowHalfDay: true, requiresProof: false, displayOrder: 10 },
  { code: 'SL', name: 'Sick Leave', isPaid: true, annualQuota: 12, accrualModel: 'monthly', accrualPerMonth: 1, carryForwardCap: 0, proofRequiredAfterDays: 3, allowHalfDay: true, requiresProof: false, displayOrder: 20 },
  { code: 'COMP_OFF', name: 'Comp-off', isPaid: true, annualQuota: 0, accrualModel: 'on_application', accrualPerMonth: 0, carryForwardCap: null, proofRequiredAfterDays: null, allowHalfDay: true, requiresProof: false, displayOrder: 30 },
  { code: 'MATERNITY_26', name: 'Maternity Leave (26 weeks)', isPaid: true, annualQuota: 182, accrualModel: 'on_application', accrualPerMonth: 0, carryForwardCap: null, proofRequiredAfterDays: 0, allowHalfDay: false, requiresProof: true, displayOrder: 40 },
  { code: 'MATERNITY_12', name: 'Maternity Leave (12 weeks)', isPaid: true, annualQuota: 84, accrualModel: 'on_application', accrualPerMonth: 0, carryForwardCap: null, proofRequiredAfterDays: 0, allowHalfDay: false, requiresProof: true, displayOrder: 50 },
  { code: 'PATERNITY', name: 'Paternity Leave', isPaid: true, annualQuota: 5, accrualModel: 'on_application', accrualPerMonth: 0, carryForwardCap: null, proofRequiredAfterDays: null, allowHalfDay: false, requiresProof: false, displayOrder: 60 },
  { code: 'LWP', name: 'Leave Without Pay', isPaid: false, annualQuota: 0, accrualModel: 'on_application', accrualPerMonth: 0, carryForwardCap: null, proofRequiredAfterDays: null, allowHalfDay: true, requiresProof: false, displayOrder: 70 },
]

/** Leave codes that never draw on a balance. */
export const NO_BALANCE_CODES = new Set(['LWP', 'WFH'])
export const COMP_OFF_CODE = 'COMP_OFF'
/** Approved leave of this type shows as SL on the register and counts as sick leave. */
export const SICK_LEAVE_CODE = 'SL'


export const NOMINEE_SCHEME_LABEL: Record<string, string> = { pf: 'Provident Fund', gratuity: 'Gratuity', insurance: 'Insurance', other: 'Other' }
export const REMARK_KIND_LABEL: Record<string, string> = { performance: 'Performance note', concern: 'Concern', one_on_one: 'One-on-one', general: 'General', commendation: 'Commendation' }
