import { Schema } from 'mongoose'
import { defineModel } from '@/lib/db/model'
import { tenant, tenantFields } from '@/lib/db/tenant'

/**
 * A workspace's own payment gateway (Settings → Integrations → Razorpay), used
 * for payment links on its invoices. Every secret is sealed with AES-256-GCM
 * (lib/secret-box) and never leaves the server; pages show `*Last4` only.
 * `hookKey` is the random path segment of its webhook URL.
 */
const PaymentGatewaySchema = new Schema(
  {
    ...tenantFields,
    provider: { type: String, enum: ['razorpay'], default: 'razorpay' },
    keyIdSealed: { type: String, required: true, select: false },
    keySecretSealed: { type: String, required: true, select: false },
    webhookSecretSealed: { type: String, required: true, select: false },
    keyIdLast4: { type: String, default: '' },
    keySecretLast4: { type: String, default: '' },
    webhookSecretLast4: { type: String, default: '' },
    mode: { type: String, enum: ['test', 'live'], default: 'test' },
    hookKey: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    lastEventAt: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
PaymentGatewaySchema.plugin(tenant)
PaymentGatewaySchema.index({ orgId: 1, provider: 1 }, { unique: true })
PaymentGatewaySchema.index({ hookKey: 1 }, { unique: true })

export const PaymentGateway = defineModel('PaymentGateway', PaymentGatewaySchema)
