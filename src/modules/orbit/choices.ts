import 'server-only'
import type { Ctx } from '@/lib/ctx'
import { STAGE_COLORS } from './constants'
import { orbitPeople, ownerOptions, reviewerOptions, type OrbitPerson } from './people'
import type { OrbitChoices } from './record-types'
import { getOrbitSettings, type OrbitConfig } from './settings'

const active = <T extends { active: boolean }>(list: T[]) => list.filter((i) => i.active)

export function choicesFrom(cfg: OrbitConfig, people: OrbitPerson[]): OrbitChoices {
  return {
    sources: active(cfg.sources).map((s) => ({ key: s.key, label: s.label, warm: s.warm })),
    sectors: active(cfg.sectors).map((s) => ({ key: s.key, label: s.label, primary: s.primary })),
    lostReasons: active(cfg.lostReasons).map((r) => ({ value: r.key, label: r.label })),
    wonReasons: active(cfg.wonReasons).map((r) => ({ value: r.key, label: r.label })),
    dealStages: cfg.dealStages.map((s) => ({ key: s.key, label: s.label, probability: s.probability, color: STAGE_COLORS[s.color] ?? STAGE_COLORS.sky })),
    owners: ownerOptions(people),
    reviewers: reviewerOptions(people),
  }
}

/** Settings + people + the client-safe choices, loaded once per page. */
export async function loadChoices(ctx: Ctx) {
  const [cfg, people] = await Promise.all([getOrbitSettings(ctx), orbitPeople(ctx)])
  return { cfg, people, choices: choicesFrom(cfg, people) }
}

/** Which Orbit powers the viewer has, for showing buttons (the server re-checks). */
export function viewerCan(ctx: Ctx) {
  return {
    leads: ctx.can('leads.write'),
    deals: ctx.can('deals.write'),
    activities: ctx.can('activities.write'),
    close: ctx.can('orbit.close'),
    admin: ctx.can('orbit.settings'),
    viewAll: ctx.can('orbit.view_all'),
    clientsWrite: ctx.can('clients.write'),
  }
}
export type ViewerCan = ReturnType<typeof viewerCan>
