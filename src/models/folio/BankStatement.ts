import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { BANK_PRESETS } from '@/modules/folio/bank/presets'

/**
 * One imported bank statement (Folio → Bank): the batch its rows came in
 * with, undone as a whole within 7 days (modules/folio/bank/service): the
 * receipts its matches made are cancelled, its expenses removed and its rows deleted.
 */
const BankStatementSchema = new Schema(
  {
    ...tenantFields,
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    bankAccountId: { type: Schema.Types.ObjectId, default: null },
    preset: { type: String, enum: BANK_PRESETS, required: true },
    fileName: { type: String, default: '' },
    fromDate: { type: String },
    toDate: { type: String },
    rows: { type: Number, default: 0 },
    imported: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    debits: { type: Number, default: 0 },
    /** `undoing` while an undo runs (no row can be claimed then); a stuck one can be undone again after 5 minutes. */
    status: { type: String, enum: ['done', 'undoing', 'undone'], default: 'done' },
    undoStartedAt: { type: Date },
    undoUntil: { type: Date, required: true },
    undoneAt: { type: Date },
    undoneBy: { type: Schema.Types.ObjectId, ref: 'Member' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member' },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
)
BankStatementSchema.plugin(tenant)
BankStatementSchema.index({ orgId: 1, createdAt: -1 })

export const BankStatement = defineModel('BankStatement', BankStatementSchema)
