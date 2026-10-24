'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { objectId } from '@/lib/validation'
import { removeGateway, saveGateway } from './gateway'
import { invoicePaymentLink } from './link-service'

/** Settings → Integrations → Razorpay, and "Create payment link" on an invoice. */

const SETTINGS_PATH = '/app/settings/integrations/razorpay'

const optionalSecret = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().min(8, 'That looks too short').max(200).optional())

const gatewaySchema = z.object({
  keyId: z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/, 'A Razorpay key id starts rzp_test_ or rzp_live_'),
  keySecret: optionalSecret,
  webhookSecret: optionalSecret,
})

export const saveRazorpayAction = action(
  gatewaySchema,
  async (input, ctx) => {
    const info = await saveGateway(ctx.orgId, { ...input, userId: ctx.userId })
    // Never the keys themselves: only which ones changed and the mode.
    await audit(ctx, { action: 'payments.gateway_saved', entity: 'PaymentGateway', entityId: ctx.orgId, summary: `Razorpay keys saved (${info.mode} mode${input.keySecret ? ', new key secret' : ''}${input.webhookSecret ? ', new webhook secret' : ''})` })
    revalidatePath(SETTINGS_PATH)
    return ok(info.mode === 'live' ? 'Razorpay connected in live mode.' : 'Razorpay connected in test mode.')
  },
  { perm: 'org.manage' },
)

export const disconnectRazorpayAction = action(
  z.object({}),
  async (_input, ctx) => {
    const removed = await removeGateway(ctx.orgId)
    if (removed) await audit(ctx, { action: 'payments.gateway_removed', entity: 'PaymentGateway', entityId: ctx.orgId, summary: 'Razorpay disconnected; its keys were deleted' })
    revalidatePath(SETTINGS_PATH)
    return ok(removed ? 'Razorpay disconnected. Its keys are deleted from Flowbit.' : 'Razorpay was not connected.')
  },
  { perm: 'org.manage' },
)

export const createPaymentLinkAction = action(
  z.object({ id: objectId }),
  async ({ id }, ctx) => {
    const link = await invoicePaymentLink(ctx, id)
    if (!link.reused) await audit(ctx, { action: 'invoice.payment_link_created', entity: 'Invoice', entityId: id, product: 'folio', summary: 'Created a Razorpay payment link for the balance' })
    revalidatePath(`/app/folio/invoices/${id}`)
    return ok(link.reused ? 'The payment link is ready.' : 'Payment link created. It also shows as "Pay now" on the invoice page.', { url: link.url })
  },
  { product: 'folio', anyPerm: ['invoices.write', 'invoices.issue', 'collections.write'] },
)
