'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDate } from '@/lib/dates'
import { IMAGE_TYPES, saveUpload } from '@/lib/files'
import { formatINR } from '@/lib/money'
import { checkbox, isoDate, objectId, paise } from '@/lib/validation'
import { User } from '@/models/User'
import { cancelAutopay, setupAutopay } from './autopay'
import { recordOfflinePayment } from './offline'
import { OFFLINE_MODES } from './rules'

/**
 * Settings → Plan & billing actions of a workspace's billing managers. They work
 * while the workspace is read-only or blocked: paying is how it opens again.
 */

const OPEN = { perm: 'billing.manage' as const, allowBlocked: true, allowReadOnly: true }

export const submitOfflinePayment = action(
  z.object({ billId: objectId, utr: z.string().trim().min(6, 'Enter the UTR from the transfer').max(40), amount: paise, paidOn: isoDate, mode: z.enum(OFFLINE_MODES), tdsDeclared: checkbox, screenshot: z.instanceof(File, { message: 'Attach a screenshot of the payment' }) }),
  async (input, ctx) => {
    if (input.amount <= 0) return fail('Enter the amount you paid.', { amount: 'Above zero' })
    const file = await saveUpload(ctx, input.screenshot, { kind: 'payment_proof', entity: 'SubscriptionInvoice', entityId: input.billId, accept: [...IMAGE_TYPES, 'application/pdf'] })
    if (!file) return fail('Attach a screenshot of the payment.', { screenshot: 'Required' })
    const user = await User.findById(ctx.userId, { name: 1 }).lean()
    const result = await recordOfflinePayment(ctx.orgId, { billId: input.billId, utr: input.utr, amountPaise: input.amount, paidOn: input.paidOn, mode: input.mode, tdsDeclared: input.tdsDeclared }, { staffId: null, userId: ctx.userId, name: user?.name ?? 'Workspace owner' }, file._id)
    if (!result.ok) return fail(result.error, result.field ? { [result.field]: result.error } : undefined)
    revalidatePath('/app/settings/subscription')
    if (!result.provisional) return ok(`Thanks. ${formatINR(input.amount)} is recorded. Flowbit will match it with the bank statement; the workspace opens fully once it is verified.`)
    return ok(`Thanks. ${formatINR(input.amount)} is recorded and the workspace stays open until ${formatDate(result.provisionalUntil)} while Flowbit matches it with the bank statement.`)
  },
  OPEN,
)

export const startAutopay = action(
  z.object({}),
  async (_input, ctx) => {
    const { shortUrl } = await setupAutopay(ctx.orgId)
    await audit(ctx, { action: 'subscription.autopay_started', entity: 'Subscription', entityId: ctx.orgId, summary: 'Opened the Razorpay autopay approval link' })
    return ok('Opening Razorpay to approve autopay…', { url: shortUrl })
  },
  OPEN,
)

export const stopAutopay = action(
  z.object({}),
  async (_input, ctx) => {
    await cancelAutopay(ctx.orgId)
    await audit(ctx, { action: 'subscription.autopay_cancelled', entity: 'Subscription', entityId: ctx.orgId, summary: 'Autopay cancelled; renewals now need a payment' })
    revalidatePath('/app/settings/subscription')
    return ok('Autopay is off. We will remind you before the plan ends.')
  },
  OPEN,
)
