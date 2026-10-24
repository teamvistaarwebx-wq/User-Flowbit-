import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * The Flowbit Slack app installed in one Slack team for one Flowbit
 * workspace. The bot token is sealed with APP_ENCRYPTION_KEY. People act as
 * themselves: Slack users are matched to members by email.
 */
const SlackInstallSchema = new Schema(
  {
    ...tenantFields,
    teamId: { type: String, required: true },
    teamName: { type: String, default: '' },
    botUserId: { type: String, default: '' },
    botTokenSealed: { type: String, required: true },
    scope: { type: String, default: '' },
    installedByName: { type: String },
    /** Optional: post task updates to this channel. */
    notifyChannelId: { type: String, default: null },
    notifyChannelName: { type: String, default: null },
    notifyEvents: { type: [String], default: [] },
  },
  { timestamps: true },
)
SlackInstallSchema.plugin(tenant)
SlackInstallSchema.index({ teamId: 1 }, { unique: true })

export const SlackInstall = defineModel('SlackInstall', SlackInstallSchema)
