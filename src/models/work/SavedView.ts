import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** A named Tasks page query (filters + view + sort), personal or shared. */
const SavedViewSchema = new Schema(
  {
    ...tenantFields,
    name: { type: String, required: true, trim: true, maxlength: 60 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    /** URL search string without '?', e.g. 'view=list&mine=1&due=overdue'. */
    query: { type: String, default: '' },
    view: { type: String, enum: ['list', 'board', 'calendar'], default: 'board' },
    shared: { type: Boolean, default: false },
    spaceId: { type: Schema.Types.ObjectId, ref: 'Space' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
)
SavedViewSchema.plugin(tenant)
SavedViewSchema.index({ orgId: 1, ownerId: 1, order: 1 })
SavedViewSchema.index({ orgId: 1, shared: 1 })

export const SavedView = defineModel('SavedView', SavedViewSchema)
