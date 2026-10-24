import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { RETAINER_FREQUENCIES, RETAINER_STATUSES } from '@/modules/folio/types'
import { isoDate, paise, percent, requiredIsoDate } from './_fields'

/**
 * A recurring agreement that produces draft invoices. There is no stored
 * "next invoice on": due billing dates are computed from the schedule after
 * the latest invoice already raised (and after `resumeFrom`), so catch-up works
 * and voiding the latest invoice makes its period due again.
 */
const RetainerSchema = new Schema(
  {
    ...tenantFields,
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true },
    hsnSac: { type: String, trim: true },
    amountPaise: paise({ required: true }),
    gstRatePercent: percent(18),
    frequency: { type: String, enum: RETAINER_FREQUENCIES, default: 'monthly' },
    startDate: requiredIsoDate(),
    endDate: isoDate(),
    billingDay: { type: Number, default: 1, min: 1, max: 31 },
    billInAdvance: { type: Boolean, default: true },
    /** Set on resume: billing dates before it (the paused stretch) are never drafted. */
    resumeFrom: isoDate(),
    status: { type: String, enum: RETAINER_STATUSES, default: 'active' },
    autoGenerate: { type: Boolean, default: true },
    paymentTermsDays: { type: Number, default: null, min: 0, max: 365 },
    /** Hours of work the retainer covers each month (optional); the Clients page compares logged time with it. */
    hoursPerMonth: { type: Number, default: null, min: 0, max: 10_000 },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true },
)
RetainerSchema.plugin(tenant)
RetainerSchema.index({ orgId: 1, clientId: 1 })
RetainerSchema.index({ orgId: 1, status: 1 })

RetainerSchema.pre('validate', function coherentRetainer() {
  if (!(this.amountPaise > 0)) throw new Error('A retainer needs an amount above zero.')
  if (this.endDate && this.endDate < this.startDate) throw new Error('A retainer cannot end before it starts.')
})

export const FolioRetainer = defineModel('FolioRetainer', RetainerSchema)
