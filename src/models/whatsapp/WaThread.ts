import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * WhatsApp B inbox: one number writing to a workspace's own WhatsApp number
 * (notifications-v2 §2.4). Matched by phone to a client, lead or member; an
 * unknown number becomes an Orbit lead with source WhatsApp.
 */
const WaThreadSchema = new Schema(
  {
    ...tenantFields,
    phone: { type: String, required: true },
    name: { type: String },
    match: {
      kind: { type: String, enum: ['client', 'lead', 'member', null], default: null },
      id: { type: Schema.Types.ObjectId },
      label: { type: String },
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Member' },
    assignedName: { type: String },
    unread: { type: Number, default: 0 },
    lastInboundAt: { type: Date },
    lastMessageAt: { type: Date, required: true },
    lastText: { type: String },
    stoppedAt: { type: Date },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
  },
  { timestamps: true },
)
WaThreadSchema.plugin(tenant)
WaThreadSchema.index({ orgId: 1, phone: 1 }, { unique: true })
WaThreadSchema.index({ orgId: 1, status: 1, lastMessageAt: -1 })

export const WaThread = defineModel('WaThread', WaThreadSchema)
