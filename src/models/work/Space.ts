import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const SpaceMemberSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    addedById: { type: Schema.Types.ObjectId, ref: 'Member' },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

const SpaceSchema = new Schema(
  {
    ...tenantFields,
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, maxlength: 500 },
    color: { type: String, default: '#818CF8' },
    /** A name from the space icon set (components/work/spaces/space-icon). */
    icon: { type: String, default: 'folder' },
    order: { type: Number, default: 0 },
    createdById: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    members: { type: [SpaceMemberSchema], default: [] },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
)
SpaceSchema.plugin(tenant)
SpaceSchema.index({ orgId: 1, archivedAt: 1, order: 1 })
SpaceSchema.index({ orgId: 1, 'members.memberId': 1 })

export const Space = defineModel('Space', SpaceSchema)
