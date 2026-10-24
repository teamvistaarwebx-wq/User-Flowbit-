import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { EXPENSE_MODES, PAID_FROM, expenseAmountIssue } from '@/modules/folio/expenses/rules'
import { paise, requiredIsoDate } from './_fields'

/**
 * Money a firm paid out. `amountPaise` is the total paid, GST included;
 * `gstPaise` is the GST inside it, claimable as input tax when `itcEligible`.
 * `repeatMonthly` marks rent-like expenses that can be copied forward;
 * `copiedFromId` links a copy to its source so a month is never copied twice.
 */
const ExpenseSchema = new Schema(
  {
    ...tenantFields,
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'FolioExpenseCategory', required: true },
    date: requiredIsoDate(),
    vendor: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 300 },
    amountPaise: paise({ required: true }),
    gstPaise: paise(),
    vendorGstin: { type: String, trim: true, uppercase: true },
    itcEligible: { type: Boolean, default: false },
    mode: { type: String, enum: EXPENSE_MODES, default: 'bank_transfer' },
    paidFrom: { type: String, enum: PAID_FROM, default: 'bank' },
    /** One of the entity's bank accounts when paid from the bank. */
    bankAccountId: { type: Schema.Types.ObjectId, default: null },
    reference: { type: String, trim: true, maxlength: 80 },
    notes: { type: String, trim: true, maxlength: 2000 },
    receiptFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile', default: null },
    repeatMonthly: { type: Boolean, default: false },
    copiedFromId: { type: Schema.Types.ObjectId, ref: 'FolioExpense', default: null },
    /** The day of the month a copied-forward expense falls on, kept across short months and early copies. */
    repeatDay: { type: Number, min: 1, max: 31, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true },
)
ExpenseSchema.plugin(tenant)
ExpenseSchema.index({ orgId: 1, date: -1 })
ExpenseSchema.index({ orgId: 1, entityId: 1, date: -1 })
ExpenseSchema.index({ orgId: 1, categoryId: 1, date: -1 })
ExpenseSchema.index({ orgId: 1, copiedFromId: 1 }, { unique: true, partialFilterExpression: { copiedFromId: { $type: 'objectId' } } })
ExpenseSchema.index({ orgId: 1, receiptFileId: 1 }, { partialFilterExpression: { receiptFileId: { $type: 'objectId' } } })

ExpenseSchema.pre('validate', function coherentExpense() {
  const issue = expenseAmountIssue({ amountPaise: this.amountPaise, gstPaise: this.gstPaise })
  if (issue) throw new Error(issue)
  if (this.paidFrom === 'cash') this.bankAccountId = null
})

export const FolioExpense = defineModel('FolioExpense', ExpenseSchema)
