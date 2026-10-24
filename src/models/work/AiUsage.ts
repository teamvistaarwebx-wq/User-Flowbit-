import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const AI_TASKS = ['outline', 'breakdown', 'progress', 'minutes'] as const
export type AiTask = (typeof AI_TASKS)[number]

/**
 * One request Arc sent to the AI provider: who asked, which model, and the
 * tokens it used. Counts towards the workspace's monthly cap (lib/ai-caps,
 * `month` in IST). Never stores the prompt or the reply.
 */
const AiUsageSchema = new Schema(
  {
    ...tenantFields,
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    task: { type: String, enum: AI_TASKS, required: true },
    model: { type: String, required: true },
    /** 'YYYY-MM' in IST. */
    month: { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    ok: { type: Boolean, default: true },
    /** A JSON retry inside the same user action: its tokens count, but not towards the monthly request cap. */
    retry: { type: Boolean, default: false },
  },
  { timestamps: true },
)
AiUsageSchema.plugin(tenant)
AiUsageSchema.index({ orgId: 1, month: 1 })

export const AiUsage = defineModel('AiUsage', AiUsageSchema)
