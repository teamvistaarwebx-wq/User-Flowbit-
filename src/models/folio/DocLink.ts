import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { DOC_KINDS } from '@/modules/doclinks/token'

/**
 * A public link to one document (notifications-v2 §1.4): `/d/<key>.<sig>`.
 * The key is random (never a document id), so links cannot be guessed or
 * enumerated; the signature lets the page refuse a forged token before any
 * lookup. Revoking sets `revokedAt`; `expiresAt` is optional. For a
 * statement, `docId` is the client.
 */
const DocLinkSchema = new Schema(
  {
    ...tenantFields,
    kind: { type: String, enum: DOC_KINDS, required: true },
    docId: { type: Schema.Types.ObjectId, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    key: { type: String, required: true },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member' },
    opens: { type: Number, default: 0 },
    firstOpenedAt: { type: Date },
    lastOpenedAt: { type: Date },
  },
  { timestamps: true },
)
DocLinkSchema.plugin(tenant)
DocLinkSchema.index({ key: 1 }, { unique: true })
DocLinkSchema.index({ orgId: 1, kind: 1, docId: 1, createdAt: -1 })

export const DocLink = defineModel('DocLink', DocLinkSchema)
