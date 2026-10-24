'use server'

import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { z } from 'zod'
import { fail, ok } from '@/lib/actions'
import { consoleAction } from '@/lib/console/session'
import { formatINR } from '@/lib/money'
import { objectId } from '@/lib/validation'
import { Org } from '@/models/Org'
import { Wallet } from '@/models/wallet/Wallet'
import { grantPromo, MAX_PROMO_PAISE } from './account'
import { MAX_ALLOWANCE_OVERRIDE } from './rules'
import { assertWhatsAppOn } from '@/modules/features/flags'

/**
 * Console → account → WhatsApp wallet: Admin grants free (promo) credit with
 * a reason. Promo credit carries no GST (nothing is paid for it), is spent
 * first, and is written to the ledger and both audit logs.
 */
export const grantPromoCredit = consoleAction(
  'wallet.grant',
  z.object({ orgId: objectId, amount: z.coerce.number().int('Whole rupees only').min(1, 'At least ₹1').max(MAX_PROMO_PAISE / 100), reason: z.string().trim().min(5, 'Say why (5 characters or more)').max(300) }),
  async (input, p) => {
    await assertWhatsAppOn()
    const orgId = new Types.ObjectId(input.orgId)
    const org = await p.raw(Org).findById(orgId, { name: 1, deletedAt: 1 }).lean()
    if (!org || org.deletedAt) return fail('That workspace was not found.')
    const paise = input.amount * 100
    const ledgerId = await grantPromo(orgId, { amountPaise: paise, reason: input.reason, staffId: p.staff.id, staffName: p.staff.name })
    await p.audit({ orgId, action: 'wallet.promo_granted', entity: 'Wallet', entityId: orgId, summary: `Granted ${formatINR(paise)} free WhatsApp credit to ${org.name}: ${input.reason}`, meta: { amountPaise: paise, ledgerId } })
    revalidatePath(`/console/accounts/${input.orgId}`)
    return ok(`${formatINR(paise)} of free credit added to ${org.name}.`)
  },
)

/**
 * Console → account → WhatsApp wallet: Admin sets this workspace's free
 * messages a month instead of its plan's allowance, or clears it (blank).
 * Audited in both logs with the reason.
 */
export const setAllowanceOverride = consoleAction(
  'wallet.grant',
  z.object({
    orgId: objectId,
    messages: z.union([z.literal(''), z.coerce.number().int('Whole messages only').min(0, 'At least 0').max(MAX_ALLOWANCE_OVERRIDE, `At most ${MAX_ALLOWANCE_OVERRIDE.toLocaleString('en-IN')}`)]),
    reason: z.string().trim().min(5, 'Say why (5 characters or more)').max(300),
  }),
  async (input, p) => {
    await assertWhatsAppOn()
    const orgId = new Types.ObjectId(input.orgId)
    const org = await p.raw(Org).findById(orgId, { name: 1, deletedAt: 1 }).lean()
    if (!org || org.deletedAt) return fail('That workspace was not found.')
    const value = input.messages === '' ? null : input.messages
    await p.raw(Wallet).updateOne({ orgId }, { $set: { freeAllowanceOverride: value } }, { upsert: true })
    const summary = value == null ? `Free WhatsApp messages for ${org.name} back to the plan's allowance: ${input.reason}` : `Free WhatsApp messages for ${org.name} set to ${value} a month: ${input.reason}`
    await p.audit({ orgId, action: 'wallet.allowance_override', entity: 'Wallet', entityId: orgId, summary, meta: { messages: value } })
    revalidatePath(`/console/accounts/${input.orgId}`)
    return ok(value == null ? 'Back to the plan\'s allowance.' : `${org.name} now gets ${value} free messages a month.`)
  },
)
