import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A company holiday. Optional holidays are not company days off: someone takes
 * one as paid leave, so the attendance calendar and leave counts ignore them.
 */
const HolidaySchema = new Schema(
  {
    ...tenantFields,
    /** 'YYYY-MM-DD' */
    date: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    isOptional: { type: Boolean, default: false },
    location: String,
  },
  { timestamps: true },
)
HolidaySchema.plugin(tenant)
HolidaySchema.index({ orgId: 1, date: 1 }, { unique: true })

export const Holiday = defineModel('Holiday', HolidaySchema)
