import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'
import { LETTER_STATUSES } from '@/modules/muster/letters/catalogue'

/** An HR letter. Drafts are editable and discardable; issued letters are never deleted, only revoked with a reason. */
const LetterSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    employeeName: { type: String, required: true },
    templateCode: { type: String, required: true },
    templateName: { type: String, required: true },
    category: { type: String, required: true },
    referenceNumber: { type: String, required: true },
    issueDate: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    signatoryName: { type: String, required: true },
    signatoryDesignation: { type: String, required: true },
    /** The company profile signatory who signs (unset for a typed-in name), and their signature and seal as of issue, so reprints match. */
    signatoryId: { type: Schema.Types.ObjectId },
    signatureFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    sealFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    inputs: { type: Schema.Types.Mixed, default: {} },
    variables: { type: Schema.Types.Mixed, default: {} },
    statesPay: { type: Boolean, default: false },
    /** False while the wording follows the template (it re-renders as the inputs change); true once HR edits it by hand. */
    wordingEdited: { type: Boolean, default: false },
    /** The covering email as last sent (drafted from the letter, editable before sending). */
    emailSubject: { type: String },
    emailBody: { type: String },
    status: { type: String, enum: LETTER_STATUSES, default: 'draft' },
    fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedAt: { type: Date },
    emailedAt: { type: Date },
    emailError: { type: String },
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revokeReason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
LetterSchema.plugin(tenant)
LetterSchema.index({ orgId: 1, referenceNumber: 1 }, { unique: true })
LetterSchema.index({ orgId: 1, employeeId: 1, createdAt: -1 })
LetterSchema.index({ orgId: 1, status: 1 })

export const Letter = defineModel('Letter', LetterSchema)
