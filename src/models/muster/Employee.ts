import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { biometricKeyOf, withBiometricKey } from './biometric-key'
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, WORK_MODES } from '@/modules/muster/people/lifecycle'

export { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES }
export const GENDERS = ['female', 'male', 'other', 'undisclosed'] as const

const BankSchema = new Schema(
  { accountName: String, accountNumber: String, ifsc: String, bankName: String },
  { _id: false },
)
const AddressSchema = new Schema({ text: { type: String, maxlength: 400 } }, { _id: false })
const EmergencySchema = new Schema({ name: String, phone: String, relation: String }, { _id: false })
const StatutorySchema = new Schema(
  { pfCovered: { type: Boolean, default: false }, esiCovered: { type: Boolean, default: false }, ptExempt: { type: Boolean, default: false } },
  { _id: false },
)

/**
 * A Muster employee. `fullName` and `workEmailLower` are denormalised on every
 * write (actions and seed set them) for search, sort and the unique index.
 * Sensitive fields: pan, uan, aadhaar, pfAccountNumber, esicNumber, bank.*.
 */
const EmployeeSchema = new Schema(
  {
    ...tenantFields,
    /** Part of the "Load sample agency" data (modules/activation/sample-data); "Remove sample data" deletes only these. */
    sample: { type: Boolean },
    code: { type: String, required: true, trim: true },
    /** The user id on the biometric attendance device, when it is not the employee code (attendance → import → biometric). */
    biometricId: { type: String, trim: true },
    /** `biometricId` normalised ("0007" = "7"), set by the hooks below; unique per workspace. */
    biometricKey: String,
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, default: '', trim: true },
    fullName: { type: String, required: true, trim: true },
    avatarFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    workEmail: { type: String, required: true, trim: true },
    workEmailLower: { type: String, required: true },
    personalEmail: String,
    phone: String,
    gender: { type: String, enum: GENDERS },
    /** 'YYYY-MM-DD' */
    dob: String,
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    designationId: { type: Schema.Types.ObjectId, ref: 'Designation' },
    /** Denormalised designation title. */
    designation: String,
    managerId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, default: 'full_time' },
    status: { type: String, enum: EMPLOYEE_STATUSES, default: 'probation' },
    joinDate: { type: String, required: true },
    /** 'YYYY-MM-DD': when probation ends (the "probation ending in 15 days" automation reads it). */
    probationEndDate: String,
    originalJoiningDate: String,
    exitDate: String,
    exitReason: String,
    resignationDate: String,
    noticePeriodDays: { type: Number, min: 0, max: 365 },
    workLocation: String,
    /** Office or remote (people/lifecycle WORK_MODES); unset counts as office. Remote people are never asked for a location at check-in. */
    workMode: { type: String, enum: WORK_MODES },
    ptState: String,
    statutory: { type: StatutorySchema, default: () => ({}) },
    isOvertimeEligible: { type: Boolean, default: false },
    pan: String,
    uan: String,
    aadhaar: String,
    pfAccountNumber: String,
    esicNumber: String,
    bank: { type: BankSchema, default: () => ({}) },
    address: { type: AddressSchema, default: () => ({}) },
    emergencyContact: { type: EmergencySchema, default: () => ({}) },
    notes: String,
    /** Only for records created by mistake; people who leave get an exit status instead. */
    deletedAt: Date,
  },
  { timestamps: true },
)
EmployeeSchema.plugin(tenant)
EmployeeSchema.index({ orgId: 1, code: 1 }, { unique: true })
EmployeeSchema.index({ orgId: 1, workEmailLower: 1 }, { unique: true })
EmployeeSchema.index({ orgId: 1, status: 1 })
EmployeeSchema.index({ orgId: 1, managerId: 1 })
EmployeeSchema.index({ orgId: 1, memberId: 1 })
// Partial: records saved before biometricKey existed have none, so the index builds on existing data.
EmployeeSchema.index({ orgId: 1, biometricKey: 1 }, { unique: true, partialFilterExpression: { biometricKey: { $type: 'string' } } })

// Runs for create, save and insertMany (each document is validated).
EmployeeSchema.pre('validate', function () {
  const key = biometricKeyOf(this.biometricId)
  this.set('biometricKey', key ?? undefined)
})
type UpdateQuery = { getUpdate: () => unknown; setUpdate: (update: Record<string, unknown>) => unknown }
/** Keeps biometricKey in step with a biometricId written by an update (pipelines are left alone). */
function syncBiometricKey(query: UpdateQuery): void {
  const update = query.getUpdate()
  if (update && typeof update === 'object' && !Array.isArray(update)) query.setUpdate(withBiometricKey(update as Record<string, unknown>))
}
EmployeeSchema.pre('findOneAndUpdate', function () {
  syncBiometricKey(this)
})
EmployeeSchema.pre('updateOne', function () {
  syncBiometricKey(this)
})
EmployeeSchema.pre('updateMany', function () {
  syncBiometricKey(this)
})

export const Employee = defineModel('Employee', EmployeeSchema)

/** Fields only `people.read_sensitive` may see or write. */
export const SENSITIVE_FIELDS = ['pan', 'uan', 'aadhaar', 'pfAccountNumber', 'esicNumber', 'bank'] as const
/** Mongo projection that hides the sensitive block. */
export const WITHOUT_SENSITIVE = { pan: 0, uan: 0, aadhaar: 0, pfAccountNumber: 0, esicNumber: 0, bank: 0 } as const
