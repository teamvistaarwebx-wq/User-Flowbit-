import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { DEFAULT_DAILY_CAP, DEFAULT_WINDOW, MAX_DAILY_CAP, MAX_WAIT_DAYS, STEP_KINDS } from '@/modules/orbit/sequences/rules'

const StepSchema = new Schema(
  {
    kind: { type: String, enum: STEP_KINDS, required: true },
    subject: { type: String, maxlength: 200, default: '' },
    body: { type: String, maxlength: 5000, default: '' },
    /** Call task or reminder: what to do. */
    note: { type: String, maxlength: 300, default: '' },
    waitDays: { type: Number, min: 1, max: MAX_WAIT_DAYS },
  },
  { _id: false },
)

/** A follow-up sequence (modules/orbit/sequences): up to 5 steps, sent in an IST window Monday to Saturday. */
const SequenceSchema = new Schema(
  {
    ...tenantFields,
    name: { type: String, required: true, trim: true, maxlength: 100 },
    steps: { type: [StepSchema], default: [] },
    window: {
      startHour: { type: Number, min: 0, max: 23, default: DEFAULT_WINDOW.startHour },
      endHour: { type: Number, min: 1, max: 24, default: DEFAULT_WINDOW.endHour },
    },
    /** Emails a sender may send a day (IST) from sequences; counted across all of them. */
    dailyCap: { type: Number, min: 1, max: MAX_DAILY_CAP, default: DEFAULT_DAILY_CAP },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
)
SequenceSchema.plugin(tenant)
SequenceSchema.index({ orgId: 1, archivedAt: 1, name: 1 })

export const Sequence = defineModel('Sequence', SequenceSchema)
