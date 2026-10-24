import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** HR's edited wording for a shipped letter. No row = the shipped wording; reset deletes the row. */
const LetterTemplateSchema = new Schema(
  {
    ...tenantFields,
    code: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedByName: { type: String },
  },
  { timestamps: true },
)
LetterTemplateSchema.plugin(tenant)
LetterTemplateSchema.index({ orgId: 1, code: 1 }, { unique: true })

export const LetterTemplate = defineModel('LetterTemplate', LetterTemplateSchema)
