import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { QuietSchema, overrideFields } from './NotificationSettings'

/** One person's notification overrides in one workspace (Profile → Notifications). */
const NotificationPrefsSchema = new Schema(
  {
    ...tenantFields,
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    groups: { type: [new Schema(overrideFields, { _id: false })], default: [] },
    quietMode: { type: String, enum: ['workspace', 'custom', 'off'], default: 'workspace' },
    quietHours: { type: QuietSchema, default: () => ({}) },
    digest: { type: String, enum: ['off', 'hourly', 'daily'], default: 'off' },
    snoozeUntil: { type: Date, default: null },
  },
  { timestamps: true },
)
NotificationPrefsSchema.plugin(tenant)
NotificationPrefsSchema.index({ orgId: 1, userId: 1 }, { unique: true })

export const NotificationPrefs = defineModel('NotificationPrefs', NotificationPrefsSchema)
