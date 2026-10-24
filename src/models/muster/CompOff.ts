import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { routingFields } from './LeaveRequest'

/** A compensatory day off earned by working a weekly off or holiday. Expiry is computed from `expiresOn`. */
const CompOffSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    workedOn: { type: String, required: true },
    days: { type: Number, enum: [0.5, 1], required: true },
    reason: String,
    expiresOn: { type: String, default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    ...routingFields,
  },
  { timestamps: true },
)
CompOffSchema.plugin(tenant)
CompOffSchema.index({ orgId: 1, employeeId: 1, workedOn: 1 }, { unique: true })

export const CompOff = defineModel('CompOff', CompOffSchema)
