import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant } from '@/lib/db/tenant'
import { ASSIGN_MODES } from '@/modules/orbit/capture/assign'

/**
 * Lead sources of one workspace (Orbit → Settings → Lead capture): the
 * public website form (a random key in its URL, an origin allow-list), the
 * generic webhook (a random key plus a sealed token), IndiaMART's pull API
 * (the CRM key sealed with secret-box) and who new leads go to.
 */
const LeadCaptureSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, unique: true },
    formKey: { type: String, required: true },
    formEnabled: { type: Boolean, default: false },
    allowedOrigins: { type: [String], default: [] },
    /** Where the plain HTML form sends people after they submit (must be on an allowed origin). */
    thankYouUrl: { type: String, default: '' },
    hookKey: { type: String, required: true },
    hookEnabled: { type: Boolean, default: false },
    hookTokenSealed: { type: String, select: false },
    hookTokenLast4: { type: String, default: '' },
    assignMode: { type: String, enum: ASSIGN_MODES, default: 'owner' },
    ownerMemberId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    poolMemberIds: { type: [Schema.Types.ObjectId], default: [] },
    rrCursor: { type: Number, default: 0 },
    indiamart: {
      enabled: { type: Boolean, default: false },
      keySealed: { type: String, select: false },
      keyLast4: { type: String, default: '' },
      lastPulledAt: { type: Date, default: null },
      lastAttemptAt: { type: Date, default: null },
      lastError: { type: String, default: '' },
      lastCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
)
LeadCaptureSchema.plugin(tenant)
LeadCaptureSchema.index({ formKey: 1 }, { unique: true })
LeadCaptureSchema.index({ hookKey: 1 }, { unique: true })
LeadCaptureSchema.index({ 'indiamart.enabled': 1 })

export const LeadCapture = defineModel('LeadCapture', LeadCaptureSchema)
