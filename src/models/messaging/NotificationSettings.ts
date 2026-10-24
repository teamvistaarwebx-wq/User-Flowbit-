import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant } from '@/lib/db/tenant'

/** One override row: null or missing = follow the layer below. */
export const overrideFields = {
  group: { type: String, required: true },
  inapp: { type: Boolean, default: null },
  email: { type: Boolean, default: null },
  whatsapp: { type: Boolean, default: null },
} as const

const QuietSchema = new Schema({ enabled: { type: Boolean, default: true }, start: { type: String, default: '21:00' }, end: { type: String, default: '08:00' } }, { _id: false })
export { QuietSchema }

/** Workspace notification defaults (Settings → Workspace alerts): one per workspace. */
const NotificationSettingsSchema = new Schema(
  {
    // One row per workspace: the unique index below doubles as the orgId index.
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true },
    groups: { type: [new Schema(overrideFields, { _id: false })], default: [] },
    quietHours: { type: QuietSchema, default: () => ({}) },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
NotificationSettingsSchema.plugin(tenant)
NotificationSettingsSchema.index({ orgId: 1 }, { unique: true })

export const NotificationSettings = defineModel('NotificationSettings', NotificationSettingsSchema)
