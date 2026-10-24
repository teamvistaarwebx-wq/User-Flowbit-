import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { ACTION_TYPES, CONDITION_OPS, FREQUENCIES, MESSAGE_CHANNELS, OFFSET_UNITS, POST_ACTION_TYPES, RECIPIENTS, SOURCE_KEYS, TRIGGER_TYPES } from '@/modules/automations/types'

/**
 * One automation rule of a workspace (notifications-v2 §3.1). Recipe rules
 * carry `recipeKey` (one per workspace); custom rules leave it empty.
 * `lastOccurrence` records the last schedule run ('2026-10' for monthly).
 */
const TriggerSchema = new Schema(
  {
    type: { type: String, enum: TRIGGER_TYPES, required: true },
    event: String,
    source: { type: String, enum: SOURCE_KEYS },
    offset: Number,
    unit: { type: String, enum: OFFSET_UNITS },
    frequency: { type: String, enum: FREQUENCIES },
    day: Number,
    time: String,
  },
  { _id: false },
)

const ConditionSchema = new Schema({ field: { type: String, required: true }, op: { type: String, enum: CONDITION_OPS, required: true }, value: Schema.Types.Mixed }, { _id: false })

const ActionSchema = new Schema(
  {
    type: { type: String, enum: ACTION_TYPES, required: true },
    recipient: { type: String, enum: RECIPIENTS, required: true },
    channel: { type: String, enum: MESSAGE_CHANNELS },
    subject: String,
    body: { type: String, default: '' },
    dueInDays: Number,
    postType: { type: String, enum: POST_ACTION_TYPES },
  },
  { _id: false },
)

const AutomationSchema = new Schema(
  {
    ...tenantFields,
    recipeKey: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: false },
    trigger: { type: TriggerSchema, required: true },
    conditions: { type: [ConditionSchema], default: [] },
    actions: { type: [ActionSchema], default: [] },
    delayMinutes: { type: Number, default: 0, min: 0 },
    businessHoursOnly: { type: Boolean, default: false },
    dailyCapPerContact: { type: Number, default: 3, min: 0 },
    lastOccurrence: { type: String, default: null },
    lastScanAt: { type: Date, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
AutomationSchema.plugin(tenant)
AutomationSchema.index({ orgId: 1, recipeKey: 1 }, { unique: true, partialFilterExpression: { recipeKey: { $type: 'string' } } })
AutomationSchema.index({ enabled: 1, 'trigger.type': 1 })

export const Automation = defineModel('Automation', AutomationSchema)
