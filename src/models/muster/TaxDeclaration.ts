import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** Rupees a year (rent: a month), as the employee declared them or HR verified them. */
const AmountsSchema = new Schema(
  {
    sec80c: { type: Number, default: 0, min: 0 },
    sec80dSelf: { type: Number, default: 0, min: 0 },
    selfSenior: { type: Boolean, default: false },
    sec80dParents: { type: Number, default: 0, min: 0 },
    parentsSenior: { type: Boolean, default: false },
    rentMonthly: { type: Number, default: 0, min: 0 },
    metro: { type: Boolean, default: false },
    landlordName: { type: String, trim: true },
    landlordPan: { type: String, trim: true, uppercase: true },
    homeLoanInterest: { type: Number, default: 0, min: 0 },
    nps80ccd1b: { type: Number, default: 0, min: 0 },
    previousEmployer: {
      type: new Schema({ taxableSalary: { type: Number, default: 0, min: 0 }, tds: { type: Number, default: 0, min: 0 }, professionalTax: { type: Number, default: 0, min: 0 } }, { _id: false }),
      default: () => ({}),
    },
  },
  { _id: false },
)

const ProofFileSchema = new Schema({ fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile', required: true }, name: String, uploadedAt: Date }, { _id: false })

/**
 * One employee's tax regime and investment declaration for a tax year
 * (Form 124, ex-12BB). `declared` drives TDS until HR verifies proofs; after
 * that `verified` does. Regime and amounts are self-service while the year's
 * declaration window is open (TaxYearSettings).
 */
const TaxDeclarationSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    /** '2026-27' */
    fy: { type: String, required: true },
    regime: { type: String, enum: ['new', 'old'], default: 'new' },
    declared: { type: AmountsSchema, default: () => ({}) },
    submittedAt: { type: Date },
    proofStatus: { type: String, enum: ['none', 'submitted', 'verified', 'rejected'], default: 'none' },
    proofFiles: { type: [ProofFileSchema], default: [] },
    proofNote: { type: String, maxlength: 500 },
    proofSubmittedAt: { type: Date },
    verified: { type: AmountsSchema },
    reviewNote: { type: String, maxlength: 500 },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: { type: String },
  },
  { timestamps: true },
)
TaxDeclarationSchema.plugin(tenant)
TaxDeclarationSchema.index({ orgId: 1, fy: 1, employeeId: 1 }, { unique: true })

export const TaxDeclaration = defineModel('TaxDeclaration', TaxDeclarationSchema)
