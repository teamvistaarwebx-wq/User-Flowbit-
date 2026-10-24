import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/** A file on an employee's record. Never hard-deleted: archived with a reason. */
const EmployeeDocumentSchema = new Schema(
  {
    ...tenantFields,
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    docType: { type: String, required: true },
    fileId: { type: Schema.Types.ObjectId, ref: 'StoredFile', required: true },
    fileName: { type: String, required: true },
    mimeType: String,
    sizeBytes: Number,
    notes: String,
    /** 'YYYY-MM-DD' for IDs, contracts and visas that expire (the "expiring in 30 days" automation reads it). */
    expiresOn: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: String,
    deletedAt: Date,
    deletedReason: String,
  },
  { timestamps: true },
)
EmployeeDocumentSchema.plugin(tenant)
EmployeeDocumentSchema.index({ orgId: 1, employeeId: 1, createdAt: -1 })
EmployeeDocumentSchema.index({ orgId: 1, expiresOn: 1 })

export const EmployeeDocument = defineModel('EmployeeDocument', EmployeeDocumentSchema)
