import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** An expense category (Folio settings → Expenses). Archived, never deleted, so old expenses keep it. */
const ExpenseCategorySchema = new Schema(
  {
    ...tenantFields,
    name: { type: String, required: true, trim: true, maxlength: 60 },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)
ExpenseCategorySchema.plugin(tenant)
ExpenseCategorySchema.index({ orgId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })

export const FolioExpenseCategory = defineModel('FolioExpenseCategory', ExpenseCategorySchema)
