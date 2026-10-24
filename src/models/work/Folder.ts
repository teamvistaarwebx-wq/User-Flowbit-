import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** A list inside a space ("folder" in the data, "list" in the UI). */
const FolderSchema = new Schema(
  {
    ...tenantFields,
    spaceId: { type: Schema.Types.ObjectId, ref: 'Space', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, maxlength: 500 },
    color: { type: String, default: '#7E768C' },
    order: { type: Number, default: 0 },
    createdById: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
)
FolderSchema.plugin(tenant)
FolderSchema.index({ orgId: 1, spaceId: 1, order: 1 })

export const Folder = defineModel('Folder', FolderSchema)
