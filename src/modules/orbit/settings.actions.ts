'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { pluralize } from '@/lib/utils'
import { Deal } from '@/models/orbit/Deal'
import { Lead } from '@/models/orbit/Lead'
import { OrbitSettings } from '@/models/orbit/OrbitSettings'
import { STAGE_COLOR_KEYS } from './constants'
import { orbitPeople } from './people'
import { optId } from './schemas'
import { getOrbitSettings } from './settings'
import { assignKeys, duplicateLabel, removedKeys } from './settings-lists'

const PERM = { product: 'orbit', perm: 'orbit.settings' } as const
const label = z.string().trim().min(2, 'Labels need at least 2 characters').max(40, 'Keep labels under 40 characters')
const key = z.string().trim().max(40).optional()

async function save(ctx: Ctx, set: Record<string, unknown>, what: string) {
  await getOrbitSettings(ctx)
  await ctx.db(OrbitSettings).updateOne({}, { $set: set })
  await audit(ctx, { action: 'orbit.settings.update', entity: 'OrbitSettings', summary: `Orbit settings saved: ${what}`, product: 'orbit', meta: { section: what } })
  revalidatePath('/app/orbit', 'layout')
  return ok(`Orbit settings saved: ${what}`)
}

export const saveDealStages = action(
  z.object({ items: z.array(z.object({ key, label, probability: z.number({ error: 'Use 0 to 100' }).int('Use a whole number').min(0, 'Use 0 to 100').max(100, 'Use 0 to 100'), color: z.enum(STAGE_COLOR_KEYS as [string, ...string[]]) })).min(1, 'Keep at least one open stage').max(8, 'Use at most 8 open stages') }),
  async ({ items }, ctx) => {
    const dup = duplicateLabel(items)
    if (dup) return fail(`Two stages are called '${dup}'. Use different names.`)
    const cfg = await getOrbitSettings(ctx)
    for (const removed of removedKeys(cfg.dealStages, items)) {
      const n = await ctx.db(Deal).countDocuments({ status: 'open', stage: removed.key })
      if (n) return fail(`${pluralize(n, 'open deal')} ${n === 1 ? 'is' : 'are'} in ${removed.label}. Move them first.`)
    }
    const keyed = assignKeys(items, cfg.dealStages, ['won', 'lost'])
    return save(ctx, { dealStages: keyed.map((s, order) => ({ key: s.key, label: s.label, probability: s.probability, color: s.color, order })) }, 'Deal stages')
  },
  PERM,
)

async function inUseError(ctx: Ctx, field: 'source' | 'sector', removed: { key: string; label: string }[]): Promise<string | null> {
  for (const item of removed) {
    const [leads, deals] = await Promise.all([ctx.db(Lead).countDocuments({ [field]: item.key }), ctx.db(Deal).countDocuments({ [field]: item.key })])
    if (leads + deals) return `'${item.label}' is used by ${pluralize(leads, 'lead')} and ${pluralize(deals, 'deal')}. Deactivate it instead.`
  }
  return null
}

export const saveSources = action(
  z.object({ items: z.array(z.object({ key, label, warm: z.boolean(), active: z.boolean() })).min(1, 'Keep at least one source').max(40) }),
  async ({ items }, ctx) => {
    if (!items.some((i) => i.active)) return fail('Keep at least one source active.')
    const dup = duplicateLabel(items)
    if (dup) return fail(`Two sources are called '${dup}'. Use different names.`)
    const cfg = await getOrbitSettings(ctx)
    const used = await inUseError(ctx, 'source', removedKeys(cfg.sources, items))
    if (used) return fail(used)
    const keyed = assignKeys(items, cfg.sources)
    return save(ctx, { sources: keyed.map((s, order) => ({ key: s.key, label: s.label, warm: s.warm, active: s.active, order })) }, 'Sources')
  },
  PERM,
)

export const saveSectors = action(
  z.object({ items: z.array(z.object({ key, label, primary: z.boolean(), active: z.boolean() })).min(1, 'Keep at least one sector').max(40) }),
  async ({ items }, ctx) => {
    if (!items.some((i) => i.active)) return fail('Keep at least one sector active.')
    if (items.filter((i) => i.primary).length !== 1) return fail('Mark exactly one sector as primary.')
    const dup = duplicateLabel(items)
    if (dup) return fail(`Two sectors are called '${dup}'. Use different names.`)
    const cfg = await getOrbitSettings(ctx)
    const used = await inUseError(ctx, 'sector', removedKeys(cfg.sectors, items))
    if (used) return fail(used)
    const keyed = assignKeys(items, cfg.sectors)
    return save(ctx, { sectors: keyed.map((s, order) => ({ key: s.key, label: s.label, primary: s.primary, active: s.active, order })) }, 'Sectors')
  },
  PERM,
)

export const saveReasons = action(
  z.object({ kind: z.enum(['lost', 'won']), items: z.array(z.object({ key, label, active: z.boolean() })).min(1, 'Keep at least one reason').max(40) }),
  async ({ kind, items }, ctx) => {
    if (!items.some((i) => i.active)) return fail('Keep at least one reason active.')
    const dup = duplicateLabel(items)
    if (dup) return fail(`Two reasons are called '${dup}'. Use different names.`)
    const cfg = await getOrbitSettings(ctx)
    const current = kind === 'lost' ? cfg.lostReasons : cfg.wonReasons
    if (kind === 'lost' && !items.some((i) => i.key === 'other')) return fail("Keep the 'Other' lost reason. Deactivate it if you don't want it offered.")
    for (const removed of removedKeys(current, items)) {
      const n =
        kind === 'lost'
          ? (await ctx.db(Lead).countDocuments({ 'closeReason.code': removed.key })) + (await ctx.db(Deal).countDocuments({ 'lostReason.code': removed.key }))
          : await ctx.db(Deal).countDocuments({ wonReason: removed.key })
      if (n) return fail(`'${removed.label}' is used on ${pluralize(n, 'record')}. Deactivate it instead.`)
    }
    const keyed = assignKeys(items, current)
    const field = kind === 'lost' ? 'lostReasons' : 'wonReasons'
    return save(ctx, { [field]: keyed.map((r, order) => ({ key: r.key, label: r.label, active: r.active, order })) }, kind === 'lost' ? 'Lost reasons' : 'Won reasons')
  },
  PERM,
)

const pctField = z.coerce.number({ error: 'Enter a percentage' }).min(0, 'Use 0 to 100').max(100, 'Use 0 to 100')
const countField = z.coerce.number({ error: 'Enter a number' }).int('Use a whole number').min(0).max(10_000, 'Use at most 10,000')

export const saveTargets = action(
  z.object({ coldMinPct: pctField, coldMaxPct: pctField, warmPct: pctField, weeklyNewLeads: countField, weeklyOutreach: countField, monthlyMeetings: countField }),
  async (input, ctx) => {
    if (input.coldMinPct > input.coldMaxPct) return fail('Some fields need attention.', { coldMinPct: "Cold min can't be above cold max" })
    return save(ctx, { targets: input }, 'Targets')
  },
  PERM,
)

export const saveGeneral = action(
  z.object({ staleDays: z.coerce.number({ error: 'Enter a number of days' }).int().min(1, 'Use 1 to 60 days').max(60, 'Use 1 to 60 days'), defaultReviewerId: optId }),
  async (input, ctx) => {
    if (input.defaultReviewerId) {
      const reviewer = (await orbitPeople(ctx)).find((p) => p.id === input.defaultReviewerId)
      if (!reviewer?.active || !reviewer.canClose) return fail('Some fields need attention.', { defaultReviewerId: 'Pick someone who can close deals (reviewer)' })
    }
    return save(ctx, { staleDays: input.staleDays, defaultReviewerId: input.defaultReviewerId ?? null }, 'General')
  },
  PERM,
)
