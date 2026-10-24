import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { DOMAIN_KINDS } from '@/modules/domains/rules'

const RecordSchema = new Schema({ purpose: String, type: String, name: String, value: String, priority: Number, status: String }, { _id: false })

/**
 * A workspace's own domain (add-on 'domains'): one sending domain (Resend)
 * and one portal host (CNAME to Flowbit) at most. A verified `domain` is
 * unique across workspaces, so a host always routes to one workspace; a
 * pending row claims nothing, so nobody can squat a host they cannot verify.
 */
const CustomDomainSchema = new Schema(
  {
    ...tenantFields,
    kind: { type: String, enum: DOMAIN_KINDS, required: true },
    domain: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, enum: ['pending', 'verified', 'failed'], default: 'pending' },
    /** Sending: Resend's domain id and the DNS records it asks for. */
    providerId: { type: String },
    records: { type: [RecordSchema], default: [] },
    lastCheckedAt: { type: Date },
    lastError: { type: String },
    verifiedAt: { type: Date },
    /** Portal: whether the host was added to the Vercel project (VERCEL_DOMAINS_API on). */
    vercelAdded: { type: Boolean },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
CustomDomainSchema.plugin(tenant)
CustomDomainSchema.index({ orgId: 1, kind: 1 }, { unique: true })
CustomDomainSchema.index({ kind: 1, domain: 1 }, { unique: true, name: 'kind_domain_verified', partialFilterExpression: { status: 'verified' } })
CustomDomainSchema.index({ domain: 1, kind: 1 })

export const CustomDomain = defineModel('CustomDomain', CustomDomainSchema)
