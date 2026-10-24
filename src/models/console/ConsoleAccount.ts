import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { HANDOVER_STEPS } from '@/lib/console/handover'
import { HEALTH_SCORES } from '@/modules/console/health'

const StepSchema = new Schema({ doneAt: Date, doneBy: { type: Schema.Types.ObjectId, ref: 'Staff' } }, { _id: false })

/**
 * Flowbit's own record about one workspace (Console only, never read by
 * customer routes): salesperson, health, trial extensions, notes and the
 * handover checklist. One per Org, created on first write.
 */
const ConsoleAccountSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, unique: true },
    salespersonId: { type: Schema.Types.ObjectId, ref: 'Staff', index: true },
    health: {
      score: { type: String, enum: HEALTH_SCORES },
      /** { activePeople: { value, target, formed }, ... } (modules/console/health). */
      signals: { type: Schema.Types.Mixed },
      computedAt: { type: Date },
    },
    /** Trial extensions so far: Sales may extend once (spec 4.1). */
    trialExtensions: { type: Number, default: 0 },
    notes: {
      type: [new Schema({ text: { type: String, required: true, maxlength: 2000 }, staffId: { type: Schema.Types.ObjectId, ref: 'Staff' }, staffName: String, at: { type: Date, default: () => new Date() } }, { _id: true })],
      default: [],
    },
    handover: {
      startedAt: { type: Date },
      steps: Object.fromEntries(HANDOVER_STEPS.map((s) => [s, { type: StepSchema }])),
    },
  },
  { timestamps: true },
)
ConsoleAccountSchema.index({ 'health.score': 1 })

export const ConsoleAccount = defineModel('ConsoleAccount', ConsoleAccountSchema)
