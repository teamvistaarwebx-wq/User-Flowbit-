import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { formatINR } from '@/lib/money'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { emitEvent } from '@/modules/automations/engine'

/** Orbit's events for the Sales automations (never throw: emitEvent logs its own failures). */

export async function emitDealWon(ctx: Pick<Ctx, 'orgId' | 'db' | 'org'>, deal: { id: string; title: string; valuePaise: number; ownerId: Types.ObjectId; stage: string }): Promise<void> {
  try {
    const owner = await ctx.db(Member).findById(deal.ownerId, { userId: 1 }).lean()
    const user = owner ? await User.findById(owner.userId, { name: 1 }).lean() : null
    await emitEvent(ctx.orgId, 'deal.won', {
      entity: 'Deal',
      entityId: deal.id,
      vars: { deal_title: deal.title, deal_value: formatINR(deal.valuePaise), owner_name: user?.name ?? '', stage_name: 'Won', days_idle: 0, business_name: ctx.org.name },
      refs: { href: `/app/orbit/deals/${deal.id}`, users: { assignee: owner ? [String(owner.userId)] : [] } },
    })
  } catch (error) {
    console.error('[automations] deal.won not emitted', deal.id, error)
  }
}
