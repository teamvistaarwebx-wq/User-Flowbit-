import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const REMARK_KINDS = ['performance', 'commendation', 'concern', 'one_on_one', 'general'] as const

/** An HR note on an employee. Archived with a reason, never hard-deleted. `commendation` is kept for older notes. */
const EmployeeRemarkSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    kind: { type: String, enum: REMARK_KINDS, default: 'general' },
    occurredOn: { type: String, required: true },
    body: { type: String, required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
    /** Set when written (General and One-on-one), so older HR-only notes never become visible later. */
    visibleToEmployee: { type: Boolean, default: false },
    deletedAt: Date,
    deletedReason: String,
  },
  { timestamps: true },
)
EmployeeRemarkSchema.plugin(tenant)
EmployeeRemarkSchema.index({ orgId: 1, employeeId: 1, occurredOn: -1 })

export const EmployeeRemark = defineModel('EmployeeRemark', EmployeeRemarkSchema)
