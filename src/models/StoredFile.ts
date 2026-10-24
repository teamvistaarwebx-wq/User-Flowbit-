import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const StoredFileSchema = new Schema(
  {
    ...tenantFields,
    name: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    /** Storage key: the path under STORAGE_DIR (local driver) or the object key in the bucket (s3 driver). */
    path: { type: String, required: true },
    /** What the file is for: 'avatar', 'logo', 'document', 'receipt', 'attachment', 'pdf', ... */
    kind: { type: String, required: true },
    entity: { type: String },
    entityId: { type: String },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
StoredFileSchema.plugin(tenant)
StoredFileSchema.index({ orgId: 1, entity: 1, entityId: 1 })

export const StoredFile = defineModel('StoredFile', StoredFileSchema)
