import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { formatINR } from '@/lib/money'
import { recordUsage } from '@/lib/usage'
import { entitlements } from '@/lib/entitlements'
import { FOLIO_EXTRA_FIRM_PAISE } from '@/lib/plans'
import { Org } from '@/models/Org'
import { activeFirmCount } from './usage'

export type FirmCapacity = { used: number; limit: number; left: number }

/** Active Folio firms against what the plan allows (Infinity during a trial, 2 on Free). */
export async function firmCapacity(ctx: Pick<Ctx, 'orgId' | 'db'>): Promise<FirmCapacity> {
  const [org, used] = await Promise.all([Org.findById(ctx.orgId, { subscription: 1 }).lean(), activeFirmCount(ctx)])
  const limit = org ? entitlements(org).folioFirmLimit : 0
  return { used, limit, left: Math.max(0, limit - used) }
}

/**
 * Refuses creating (or reactivating) `adding` Folio firms beyond the plan:
 * 2 are included with Folio, each extra is a paid add-on. Call it before the
 * write in the Folio entity create/reactivate actions.
 */
export async function assertFirmCapacity(ctx: Pick<Ctx, 'orgId' | 'db'>, adding = 1): Promise<void> {
  const { used, limit } = await firmCapacity(ctx)
  if (used + adding <= limit) return
  recordUsage({ kind: 'limit_hit', orgId: ctx.orgId, product: 'folio', meta: { limit: 'firms', used, max: limit } })
  const price = formatINR(FOLIO_EXTRA_FIRM_PAISE, { decimals: 0 })
  throw new UserError(
    limit === 0
      ? 'Folio is not part of your plan. Add it in Settings → Plan & billing.'
      : `Your plan includes ${limit} ${limit === 1 ? 'firm' : 'firms'} and ${used} ${used === 1 ? 'is' : 'are'} active. Add another firm for ${price} a month in Settings → Plan & billing, or deactivate one first.`,
  )
}
