import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const InviteSchema = new Schema(
  {
    ...tenantFields,
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, trim: true },
    title: { type: String, trim: true },
    role: { type: String, required: true, default: 'member' },
    /** Muster Employee to link on acceptance. */
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
    revokedAt: { type: Date },
    sentAt: { type: Date },
    /** How many times this person's invite was emailed (1 on first send, +1 per resend). */
    sendCount: { type: Number, default: 1 },
  },
  { timestamps: true },
)
InviteSchema.plugin(tenant)
InviteSchema.index({ orgId: 1, email: 1 })

export const Invite = defineModel('Invite', InviteSchema)
