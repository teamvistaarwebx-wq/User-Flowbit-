'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { formatDate } from '@/lib/dates'
import { freeReturnMessage, TRIAL_REFUSAL_MESSAGE } from '@/lib/lifecycle'
import { recordUsage } from '@/lib/usage'
import { returnToFree, startTrial } from '@/modules/lifecycle/plan-switch'

/** "Start 15-day trial" from the seat-limit prompt or the subscription page: once per workspace. */
export const startTrialAction = action(
  z.object({}),
  async (_input, ctx) => {
    const days = ctx.planConfig.trialDays
    const result = await startTrial(ctx.orgId, ctx.org, new Date(), ctx.planConfig)
    if (!result.ok) return fail(TRIAL_REFUSAL_MESSAGE[result.reason])
    recordUsage({ kind: 'upgrade_clicked', orgId: ctx.orgId, userId: ctx.userId, meta: { action: 'trial_started' } })
    await audit(ctx, { action: 'subscription.trial_started', entity: 'Org', entityId: ctx.orgId, summary: `Started the ${days}-day trial (until ${formatDate(result.endsAt)})` })
    revalidatePath('/app', 'layout')
    return ok(`Your ${days}-day trial has started. Add everyone you need until ${formatDate(result.endsAt)}.`)
  },
  { perm: 'billing.manage' },
)

/** "Stay on Free": a trial trimmed to 5 people returns to Free for the rest of its 6 months. Allowed while read-only. */
export const returnToFreeAction = action(
  z.object({}),
  async (_input, ctx) => {
    const result = await returnToFree(ctx, ctx.org, new Date(), ctx.planConfig)
    if (!result.ok) return fail(freeReturnMessage(result.reason, ctx.planConfig.freeSeats, ctx.planConfig.freeMonths))
    await audit(ctx, { action: 'subscription.free_restored', entity: 'Org', entityId: ctx.orgId, summary: `Moved back to the Free plan (until ${formatDate(result.endsAt)})` })
    revalidatePath('/app', 'layout')
    return ok(`You're on the Free plan again until ${formatDate(result.endsAt)}.`)
  },
  { perm: 'billing.manage', allowReadOnly: true },
)
