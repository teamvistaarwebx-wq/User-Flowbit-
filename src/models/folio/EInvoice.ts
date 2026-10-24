import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

const EwbSchema = new Schema(
  {
    ewbNo: { type: String, required: true },
    ewbDate: { type: String },
    validTill: { type: String },
    transMode: { type: String },
    distanceKm: { type: Number },
    vehicleNo: { type: String },
    transporterId: { type: String },
    transporterName: { type: String },
    transDocNo: { type: String },
    transDocDate: { type: String },
    generatedAt: { type: Date },
    generatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
)

/**
 * The IRN registered for an invoice on the Invoice Registration Portal (through
 * a GSP), with its acknowledgement, signed QR and any e-way bill. Kept apart
 * from the invoice so the issued invoice stays frozen. A cancelled IRN stays
 * as a record; a new IRN for the same document number is not allowed by NIC.
 */
const EInvoiceSchema = new Schema(
  {
    ...tenantFields,
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    entityId: { type: Schema.Types.ObjectId, ref: 'FolioEntity', required: true },
    environment: { type: String, enum: ['sandbox', 'production'], required: true },
    irn: { type: String, required: true },
    ackNo: { type: String, required: true },
    /** As the IRP returned it ('2026-10-09 12:01:00'). */
    ackDate: { type: String, required: true },
    signedQr: { type: String, required: true },
    signedInvoice: { type: String },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    cancelRemark: { type: String },
    ewb: { type: EwbSchema, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
EInvoiceSchema.plugin(tenant)
EInvoiceSchema.index({ orgId: 1, invoiceId: 1, status: 1 })
EInvoiceSchema.index({ orgId: 1, irn: 1 }, { unique: true })

export const EInvoice = defineModel('EInvoice', EInvoiceSchema)
