import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

export const TEAM_ROLES = ['lead', 'member'] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

const TeamMemberSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    role: { type: String, enum: TEAM_ROLES, default: 'member' },
    addedById: { type: Schema.Types.ObjectId, ref: 'Member' },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

/** A team of members. The shell side panel reads { name, color } from the `teams` collection. */
const TeamSchema = new Schema(
  {
    ...tenantFields,
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    color: { type: String, default: '#C084FC' },
    isActive: { type: Boolean, default: true },
    /** Invite only: members cannot join themselves, so posts aimed at the team stay with the people added (R3 M2). */
    isPrivate: { type: Boolean, default: false },
    createdById: { type: Schema.Types.ObjectId, ref: 'Member' },
    members: { type: [TeamMemberSchema], default: [] },
  },
  { timestamps: true },
)
TeamSchema.plugin(tenant)
TeamSchema.index({ orgId: 1, name: 1 }, { unique: true })
TeamSchema.index({ orgId: 1, 'members.memberId': 1 })

export const Team = defineModel('Team', TeamSchema)
