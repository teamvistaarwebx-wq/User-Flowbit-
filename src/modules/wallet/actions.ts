'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { checkbox } from '@/lib/validation'
import { formatINR } from '@/lib/money'
import { setAutoTopUp, setCaps } from './account'
import { startRecharge } from './recharge'
import { MAX_RECHARGE_PAISE, rechargeRefusal } from './rules'
import { assertWhatsAppOn } from '@/modules/features/flags'

/** Settings → Plan & billing → WhatsApp wallet: recharge, spend caps, the auto top-up setting. `billing.manage` only. */

const PATH = '/app/settings/billing/wallet'
const BILLING = { perm: 'billing.manage', allowReadOnly: true } as const
const rupees = z.coerce.number().int('Whole rupees only').min(0, 'Not below 0').max(MAX_RECHARGE_PAISE / 100)
const toPaise = (r: number) => Math.round(r * 100)

export const rechargeWalletAction = action(
  z.object({ amount: z.coerce.number({ error: 'Pick a pack or enter an amount' }).int('Whole rupees only') }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    const paise = toPaise(input.amount)
    const refusal = rechargeRefusal(paise)
    if (refusal) return fail(refusal, { amount: refusal })
    const started = await startRecharge(ctx.orgId, paise, { userId: ctx.userId, name: ctx.user.name })
    await audit(ctx, { action: 'wallet.recharge_started', entity: 'Wallet', entityId: ctx.orgId, summary: `Started a WhatsApp wallet recharge of ${formatINR(paise)}${started.simulated ? ' (simulated, development)' : ''}` })
    revalidatePath(PATH)
    if (started.simulated) return ok(`Test recharge added${started.invoiceNumber ? `: invoice ${started.invoiceNumber}` : ''}.`, { url: null as string | null })
    return ok('Opening Razorpay to pay. The credit appears here as soon as the payment arrives.', { url: started.url })
  },
  BILLING,
)

export const setWalletCapsAction = action(
  z.object({ daily: rupees, monthly: rupees }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    if (input.daily > 0 && input.monthly > 0 && input.daily > input.monthly) return fail('The daily cap cannot be above the monthly cap.', { daily: 'Above the monthly cap' })
    await setCaps(ctx.orgId, { dailyPaise: toPaise(input.daily), monthlyPaise: toPaise(input.monthly) })
    await audit(ctx, { action: 'wallet.caps_set', entity: 'Wallet', entityId: ctx.orgId, summary: `WhatsApp spend caps: ${input.daily ? `₹${input.daily} a day` : 'no daily cap'}, ${input.monthly ? `₹${input.monthly} a month` : 'no monthly cap'}` })
    revalidatePath(PATH)
    return ok('Spend caps saved.')
  },
  BILLING,
)

export const setAutoTopUpAction = action(
  z.object({ enabled: checkbox, below: rupees, pack: rupees }),
  async (input, ctx) => {
    await assertWhatsAppOn()
    if (input.enabled && rechargeRefusal(toPaise(input.pack))) return fail('Pick a top-up of at least ₹500.', { pack: 'At least ₹500' })
    await setAutoTopUp(ctx.orgId, { enabled: input.enabled, belowPaise: toPaise(input.below), packPaise: toPaise(input.pack) })
    await audit(ctx, { action: 'wallet.auto_top_up_set', entity: 'Wallet', entityId: ctx.orgId, summary: input.enabled ? `Auto top-up on: ₹${input.pack} when below ₹${input.below}` : 'Auto top-up off' })
    revalidatePath(PATH)
    return ok(input.enabled ? 'Saved. Until autopay for the wallet arrives, we will remind you to recharge instead of charging you.' : 'Auto top-up is off.')
  },
  BILLING,
)
