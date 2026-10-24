import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { EXIT_REASONS, STEP_KINDS } from '@/modules/orbit/sequences/rules'

export const ENROLLMENT_STATUSES = ['active', 'completed', 'exited'] as const

const HistorySchema = new Schema(
  {
    stepIndex: { type: Number, required: true },
    kind: { type: String, enum: STEP_KINDS, required: true },
    at: { type: Date, required: true },
    outcome: { type: String, enum: ['sent', 'task', 'waited', 'failed'], required: true },
    via: { type: String, enum: ['gmail', 'resend', null], default: null },
    note: { type: String, maxlength: 300 },
    /** Gmail-sent steps: the Gmail thread, checked for replies when Gmail reply detection is on. */
    threadId: { type: String },
  },
  { _id: false },
)

/**
 * One lead going through one sequence. The member who enrolled the lead is
 * the sender: their Gmail (if connected) or Flowbit's mail with Reply-To set
 * to them, and their daily cap. The runner claims a due row with
 * `claimedUntil` so two cron runs never send the same step.
 */
const SequenceEnrollmentSchema = new Schema(
  {
    ...tenantFields,
    sequenceId: { type: Schema.Types.ObjectId, ref: 'Sequence', required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'active' },
    exitReason: { type: String, enum: [...EXIT_REASONS, null], default: null },
    /** The next step to run (0-based). */
    stepIndex: { type: Number, default: 0 },
    nextRunAt: { type: Date, default: () => new Date() },
    claimedUntil: { type: Date, default: null },
    failures: { type: Number, default: 0 },
    /** Set just before an email step is handed to Gmail/Resend: a run that dies after sending never sends it twice. */
    sendingStep: { type: Number, default: null },
    history: { type: [HistorySchema], default: [] },
    finishedAt: { type: Date, default: null },
    /** Gmail reply detection: when the threads were last read (the check walks the oldest first). */
    replyCheckedAt: { type: Date, default: null },
  },
  { timestamps: true },
)
SequenceEnrollmentSchema.plugin(tenant)
// One live enrolment per lead.
SequenceEnrollmentSchema.index({ orgId: 1, leadId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } })
SequenceEnrollmentSchema.index({ status: 1, nextRunAt: 1 })
SequenceEnrollmentSchema.index({ orgId: 1, sequenceId: 1, status: 1 })

export const SequenceEnrollment = defineModel('SequenceEnrollment', SequenceEnrollmentSchema)
