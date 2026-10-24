import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { DEMO_PRODUCTS, DEMO_REQUEST_STATUSES, DEMO_TEAM_SIZES } from '@/modules/marketing/demo'

/**
 * A demo request from the public /contact page. Not tenant data: it arrives
 * before any workspace exists, so it carries no orgId and is read only by
 * Flowbit staff (platform admin).
 */

const DemoRequestSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    company: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    teamSize: { type: String, enum: DEMO_TEAM_SIZES, required: true },
    products: [{ type: String, enum: DEMO_PRODUCTS }],
    message: { type: String, required: true },
    status: { type: String, enum: DEMO_REQUEST_STATUSES, default: 'new' },
    /** Message id (Messages log) of the notification sent to Flowbit staff. */
    mailId: { type: String },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
)
DemoRequestSchema.index({ createdAt: -1 })
DemoRequestSchema.index({ email: 1, createdAt: -1 })

export const DemoRequest = defineModel('DemoRequest', DemoRequestSchema)
