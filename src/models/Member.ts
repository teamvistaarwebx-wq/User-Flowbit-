import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const MEMBER_STATUSES = ['active', 'invited', 'disabled'] as const

const MemberSchema = new Schema(
  {
    ...tenantFields,
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Built-in role key ('owner', 'admin', ...) or a custom Role _id as a string. */
    role: { type: String, required: true, default: 'member' },
    status: { type: String, enum: MEMBER_STATUSES, default: 'active' },
    title: { type: String },
    /** What they know, for the team cards' "who knows" filter (lib/skills; Settings → Profile). */
    skills: { type: [String], default: undefined },
    /** IANA zone for the local time on team cards; unset = the workspace's. */
    timezone: { type: String },
    department: { type: String },
    managerId: { type: Schema.Types.ObjectId, ref: 'Member' },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    /** Accepted the location notice for check-in (lib/geo LOCATION_NOTICE_VERSION), per workspace. */
    locationConsent: { type: new Schema({ at: Date, version: Number }, { _id: false }), default: undefined },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
)
MemberSchema.plugin(tenant)
MemberSchema.index({ orgId: 1, userId: 1 }, { unique: true })
MemberSchema.index({ orgId: 1, status: 1 })
// Every /app render lists the signed-in user's memberships across workspaces (shell, ctx, sign-in).
MemberSchema.index({ userId: 1, status: 1 })

export const Member = defineModel('Member', MemberSchema)
