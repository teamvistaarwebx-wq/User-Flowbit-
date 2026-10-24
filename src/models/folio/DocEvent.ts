import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { DOC_EVENT_TYPES } from '@/modules/doclinks/timeline'
import { DOC_KINDS } from '@/modules/doclinks/token'

/**
 * What happened to a document outside the app: the client opened its link,
 * accepted or declined a quote, shared a UTR, or paid through a payment link.
 * With the Message rows it makes the document timeline.
 */
const DocEventSchema = new Schema(
  {
    ...tenantFields,
    kind: { type: String, enum: DOC_KINDS, required: true },
    docId: { type: Schema.Types.ObjectId, required: true },
    linkId: { type: Schema.Types.ObjectId, ref: 'DocLink' },
    type: { type: String, enum: DOC_EVENT_TYPES, required: true },
    at: { type: Date, required: true },
    /** Typed name (quote acceptance) and the client's comment. */
    name: { type: String, trim: true },
    comment: { type: String, trim: true },
    utr: { type: String, trim: true },
    amountPaise: { type: Number },
    /** Paid online: the gateway's payment id; one "paid" entry per payment (V2-REVIEW P4). */
    paymentId: { type: String },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
)
DocEventSchema.plugin(tenant)
DocEventSchema.index({ orgId: 1, kind: 1, docId: 1, at: 1 })
DocEventSchema.index({ orgId: 1, paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } })

export const DocEvent = defineModel('DocEvent', DocEventSchema)
