import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant } from '@/lib/db/tenant'

/**
 * WhatsApp B: a workspace's own number (Settings → Integrations → WhatsApp).
 * Mode 'byo' sends through the workspace's own Interakt key (Interakt bills
 * it for Meta); 'managed' will send through Flowbit's Interakt partner
 * account (not available yet). Secrets are sealed with AES-256-GCM
 * (lib/secret-box) and never leave the server; pages see `*Last4` only.
 * `hookKey` is the random path segment of the workspace's webhook URL.
 */
const WaConnectionSchema = new Schema(
  {
    /** One per workspace. */
    orgId: { type: Schema.Types.ObjectId, ref: 'Org', required: true, unique: true },
    mode: { type: String, enum: ['byo', 'managed'], default: 'byo' },
    status: { type: String, enum: ['connected', 'disconnected'], default: 'connected' },
    apiKeySealed: { type: String, select: false },
    apiKeyLast4: { type: String, default: '' },
    webhookSecretSealed: { type: String, select: false },
    webhookSecretLast4: { type: String, default: '' },
    hookKey: { type: String, required: true },
    displayName: { type: String, trim: true },
    /** The workspace's WhatsApp number, E.164. */
    phone: { type: String },
    /** The template mapping: key → { name, language, category, params } (modules/whatsapp/customer-templates). */
    templates: { type: Schema.Types.Mixed },
    connectedAt: { type: Date },
    connectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    disconnectedAt: { type: Date },
    lastEventAt: { type: Date },
    lastTest: { at: Date, ok: Boolean, to: String, error: String },
    /** The employee WhatsApp bot (check in/out, leave, payslip link): off until an admin turns it on (BYO mode only). */
    botEnabled: { type: Boolean, default: false },
    /** Saved replies for the inbox (§2.4): a title and the text. */
    cannedReplies: { type: [new Schema({ title: { type: String, required: true, trim: true, maxlength: 60 }, text: { type: String, required: true, trim: true, maxlength: 1000 } }, { _id: true })], default: [] },
  },
  { timestamps: true },
)
WaConnectionSchema.plugin(tenant)
WaConnectionSchema.index({ hookKey: 1 }, { unique: true })

export const WaConnection = defineModel('WaConnection', WaConnectionSchema)
