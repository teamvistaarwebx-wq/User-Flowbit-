import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { Automation } from '@/models/automations/Automation'
import { AutomationRun } from '@/models/automations/AutomationRun'
import { getFolioSettings } from '@/modules/folio/settings/queries'
import { describeTiming, describeTrigger } from './describe'
import { triggerDef } from './catalog'
import { displayRuleName, recipeByKey, SAMPLE_VALUES, type RecipeArea } from './recipes'
import type { RunStatus, StepStatus } from './run-status'
import { ensureRecipes } from './seed'
import type { AutomationAction, Condition, Trigger } from './types'
import { hasHindi } from './recipes-hi'

/** Settings → Automations: the rules (seeded on first open) and run history, as plain data for the pages. */

export type RuleRow = { id: string; name: string; description: string; area: RecipeArea | 'custom'; enabled: boolean; trigger: string; timing: string | null; bridgeHref: string | null; channels: string[] }

export type RunRow = { id: string; rule: string; ruleId: string; status: RunStatus; at: string; dueAt: string; entity: string; test: boolean; note: string | null; steps: { action: string; status: StepStatus; note: string | null; to: string | null }[] }

const BRIDGE_HREF = { folio_reminders: '/app/folio/settings?tab=reminders' } as const

export async function automationList(ctx: Pick<Ctx, 'orgId' | 'db'>): Promise<RuleRow[]> {
  await ensureRecipes(ctx.orgId)
  const [rules, folio] = await Promise.all([ctx.db(Automation).find({}).sort({ createdAt: 1 }).lean(), getFolioSettings(ctx)])
  return rules.map((r) => {
    const recipe = recipeByKey(r.recipeKey)
    const bridge = recipe?.bridge
    return {
      id: String(r._id),
      name: displayRuleName(r.name),
      description: recipe?.description ?? '',
      area: recipe?.area ?? 'custom',
      // The reminder switch is Folio's own setting; show that, so both screens agree.
      enabled: bridge === 'folio_reminders' ? folio.reminders?.enabled !== false : r.enabled,
      trigger: bridge ? 'The schedule in Folio settings' : describeTrigger(r.trigger as Trigger),
      timing: describeTiming({ delayMinutes: r.delayMinutes ?? 0, businessHoursOnly: Boolean(r.businessHoursOnly) }),
      bridgeHref: bridge ? BRIDGE_HREF[bridge] : null,
      channels: [...new Set((r.actions ?? []).map((a) => (a.type === 'message' ? (a.channel === 'whatsapp' ? 'WhatsApp, email fallback' : 'Email') : a.type === 'task' ? 'Task' : a.type === 'post' ? 'Feed post' : 'Alert')))],
    }
  })
}

type RunDoc = { _id: unknown; automationId: unknown; status: string; createdAt?: Date; dueAt: Date; entity: string; test?: boolean; note?: string | null; steps?: { action: string; status: string; note?: string | null; to?: string | null }[] }

const toRunRow = (r: RunDoc, names: Map<string, string>): RunRow => ({
  id: String(r._id),
  rule: names.get(String(r.automationId)) ?? 'Deleted automation',
  ruleId: String(r.automationId),
  status: r.status as RunStatus,
  at: (r.createdAt ?? r.dueAt).toISOString(),
  dueAt: r.dueAt.toISOString(),
  entity: r.entity,
  test: Boolean(r.test),
  note: r.note ?? null,
  steps: (r.steps ?? []).map((s) => ({ action: s.action, status: s.status as StepStatus, note: s.note ?? null, to: s.to ?? null })),
})

export async function runHistory(ctx: Pick<Ctx, 'db'>, opts: { automationId?: string; limit?: number } = {}): Promise<RunRow[]> {
  const [runs, rules] = await Promise.all([
    ctx.db(AutomationRun).find(opts.automationId ? { automationId: opts.automationId } : {}).sort({ createdAt: -1 }).limit(opts.limit ?? 30).lean(),
    ctx.db(Automation).find({}, { name: 1 }).lean(),
  ])
  const names = new Map(rules.map((r) => [String(r._id), displayRuleName(r.name)]))
  return runs.map((r) => toRunRow(r as unknown as RunDoc, names))
}

export type RuleDetail = {
  id: string
  name: string
  description: string
  enabled: boolean
  isRecipe: boolean
  /** The recipe has Hindi wording (a draft for review, modules/automations/recipes-hi). */
  hindi: boolean
  bridgeHref: string | null
  trigger: Trigger
  triggerLabel: string
  conditions: Condition[]
  actions: AutomationAction[]
  delayMinutes: number
  businessHoursOnly: boolean
  dailyCapPerContact: number
  variables: string[]
  /** Values conditions can test besides the wording variables. */
  conditionFields: string[]
  sample: Record<string, string | number>
}

export async function automationDetail(ctx: Pick<Ctx, 'orgId' | 'db'>, id: string): Promise<RuleDetail | null> {
  await ensureRecipes(ctx.orgId)
  const r = await ctx.db(Automation).findById(id).lean()
  if (!r) return null
  const recipe = recipeByKey(r.recipeKey)
  return {
    id: String(r._id),
    name: displayRuleName(r.name),
    description: recipe?.description ?? '',
    enabled: r.enabled,
    isRecipe: Boolean(recipe),
    hindi: hasHindi(recipe?.key),
    bridgeHref: recipe?.bridge ? BRIDGE_HREF[recipe.bridge] : null,
    trigger: JSON.parse(JSON.stringify(r.trigger)) as Trigger,
    triggerLabel: describeTrigger(r.trigger as Trigger),
    conditions: (r.conditions ?? []).map((c) => ({ field: c.field, op: c.op, value: (c.value as string | number | null | undefined) ?? null })),
    actions: (r.actions ?? []).map((a) => ({ type: a.type, recipient: a.recipient, channel: a.channel ?? undefined, subject: a.subject ?? '', body: a.body ?? '', dueInDays: a.dueInDays ?? undefined, postType: a.postType ?? undefined })),
    delayMinutes: r.delayMinutes ?? 0,
    businessHoursOnly: Boolean(r.businessHoursOnly),
    dailyCapPerContact: r.dailyCapPerContact ?? 0,
    variables: [...(recipe?.variables ?? triggerDef(r.trigger as Trigger)?.variables ?? [])],
    conditionFields: [...(triggerDef(r.trigger as Trigger)?.conditionFields ?? [])],
    sample: Object.fromEntries(Object.entries(recipe?.sample ?? SAMPLE_VALUES).filter((e): e is [string, string | number] => e[1] !== null && e[1] !== undefined)),
  }
}
