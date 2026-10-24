import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'

type Str = string | null | undefined
type Id = Types.ObjectId | null | undefined

/** The employee fields the profile tabs read (a lean Employee document satisfies it). */
export type EmployeeDoc = {
  _id: Types.ObjectId
  code: string
  firstName: string
  fullName: string
  workEmail: string
  personalEmail?: Str
  phone?: Str
  gender?: Str
  dob?: Str
  address?: { text?: Str } | null
  departmentId?: Id
  designationId?: Id
  designation?: Str
  managerId?: Id
  memberId?: Id
  employmentType: string
  status: string
  joinDate: string
  originalJoiningDate?: Str
  exitDate?: Str
  exitReason?: Str
  resignationDate?: Str
  noticePeriodDays?: number | null
  workLocation?: Str
  workMode?: Str
  biometricId?: Str
  ptState?: Str
  statutory?: { pfCovered?: boolean | null; esiCovered?: boolean | null; ptExempt?: boolean | null } | null
  isOvertimeEligible?: boolean | null
  pan?: Str
  uan?: Str
  aadhaar?: Str
  pfAccountNumber?: Str
  esicNumber?: Str
  bank?: { bankName?: Str; accountName?: Str; accountNumber?: Str; ifsc?: Str } | null
  emergencyContact?: { name?: Str; phone?: Str; relation?: Str } | null
}

export type TabProps = { ctx: Ctx; employee: EmployeeDoc; sp: Record<string, string | string[] | undefined> }
