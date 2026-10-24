import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** A month's attendance state. Locked months refuse every attendance write (and check-in punches). */
const AttendancePeriodSchema = new Schema(
  {
    ...tenantFields,
    year: { type: Number, required: true, min: 2000, max: 2100 },
    month: { type: Number, required: true, min: 1, max: 12 },
    /** 'YYYY-MM' */
    period: { type: String, required: true },
    status: { type: String, enum: ['open', 'locked'], default: 'open' },
    workingDays: Number,
    headcount: Number,
    lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lockedByName: String,
    lockedAt: Date,
    reopenedReason: String,
    reopenedAt: Date,
  },
  { timestamps: true },
)
AttendancePeriodSchema.plugin(tenant)
AttendancePeriodSchema.index({ orgId: 1, year: 1, month: 1 }, { unique: true })

export const AttendancePeriod = defineModel('AttendancePeriod', AttendancePeriodSchema)
