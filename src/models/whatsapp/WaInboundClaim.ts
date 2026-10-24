import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'

/**
 * One row per inbound WhatsApp message handled (V2-REVIEW P2). Inserting it
 * is the first step of handling an inbound webhook; the unique index on
 * (scope, providerId) makes a redelivery, even one arriving at the same
 * moment, fail to claim, so nothing is stored, counted or answered twice.
 * `scope` is 'platform' (Flowbit's own number) or the workspace's id. Rows
 * expire after 30 days, long after any provider stops retrying.
 */
const WaInboundClaimSchema = new Schema(
  {
    scope: { type: String, required: true },
    providerId: { type: String, required: true },
    at: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
)
WaInboundClaimSchema.index({ scope: 1, providerId: 1 }, { unique: true })
WaInboundClaimSchema.index({ at: 1 }, { expireAfterSeconds: 30 * 86_400 })

export const WaInboundClaim = defineModel('WaInboundClaim', WaInboundClaimSchema)
