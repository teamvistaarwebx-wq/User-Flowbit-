import type { Ctx } from '@/lib/ctx'
import { OrbitSettings } from '@/models/orbit/OrbitSettings'
import {
  DEFAULT_DEAL_STAGES, DEFAULT_LOST_REASONS, DEFAULT_SECTORS, DEFAULT_SOURCES, DEFAULT_STALE_DAYS, DEFAULT_TARGETS, DEFAULT_WON_REASONS,
  type DealStageDef, type ReasonDef, type SectorDef, type SourceDef, type StageColor, type Targets,
} from './constants'

export type OrbitConfig = {
  dealStages: DealStageDef[]
  sources: SourceDef[]
  sectors: SectorDef[]
  lostReasons: ReasonDef[]
  wonReasons: ReasonDef[]
  targets: Targets
  staleDays: number
  defaultReviewerId: string | null
}

export const DEFAULT_SETTINGS_DOC = {
  dealStages: DEFAULT_DEAL_STAGES,
  sources: DEFAULT_SOURCES,
  sectors: DEFAULT_SECTORS,
  lostReasons: DEFAULT_LOST_REASONS,
  wonReasons: DEFAULT_WON_REASONS,
  targets: DEFAULT_TARGETS,
  staleDays: DEFAULT_STALE_DAYS,
  defaultReviewerId: null,
}

const byOrder = <T extends { order: number }>(list: T[]) => [...list].sort((a, b) => a.order - b.order)

type RawSettings = {
  dealStages?: { key: string; label: string; probability: number; color?: string | null; order?: number | null }[]
  sources?: { key: string; label: string; warm?: boolean | null; active?: boolean | null; order?: number | null }[]
  sectors?: { key: string; label: string; primary?: boolean | null; active?: boolean | null; order?: number | null }[]
  lostReasons?: { key: string; label: string; active?: boolean | null; order?: number | null }[]
  wonReasons?: { key: string; label: string; active?: boolean | null; order?: number | null }[]
  targets?: Partial<Targets> | null
  staleDays?: number | null
  defaultReviewerId?: unknown
}

const reasons = (list: RawSettings['lostReasons'] = []) => byOrder(list.map((r) => ({ key: r.key, label: r.label, active: r.active !== false, order: r.order ?? 0 })))

export function toConfig(doc: RawSettings): OrbitConfig {
  return {
    dealStages: byOrder((doc.dealStages ?? []).map((s) => ({ key: s.key, label: s.label, probability: s.probability, color: (s.color ?? 'sky') as StageColor, order: s.order ?? 0 }))),
    sources: byOrder((doc.sources ?? []).map((s) => ({ key: s.key, label: s.label, warm: Boolean(s.warm), active: s.active !== false, order: s.order ?? 0 }))),
    sectors: byOrder((doc.sectors ?? []).map((s) => ({ key: s.key, label: s.label, primary: Boolean(s.primary), active: s.active !== false, order: s.order ?? 0 }))),
    lostReasons: reasons(doc.lostReasons),
    wonReasons: reasons(doc.wonReasons),
    targets: { ...DEFAULT_TARGETS, ...Object.fromEntries(Object.entries(doc.targets ?? {}).filter(([, v]) => typeof v === 'number')) },
    staleDays: doc.staleDays ?? DEFAULT_STALE_DAYS,
    defaultReviewerId: doc.defaultReviewerId ? String(doc.defaultReviewerId) : null,
  }
}

/** The workspace's Orbit settings, created with defaults on first read. */
export async function getOrbitSettings(ctx: Pick<Ctx, 'db'>): Promise<OrbitConfig> {
  const doc = await ctx.db(OrbitSettings).findOneAndUpdate({}, { $setOnInsert: DEFAULT_SETTINGS_DOC }, { upsert: true, setDefaultsOnInsert: false }).lean()
  return toConfig((doc ?? DEFAULT_SETTINGS_DOC) as unknown as RawSettings)
}

export const activeKeys = (list: readonly { key: string; active: boolean }[]) => list.filter((i) => i.active).map((i) => i.key)
export const isWarmSource = (cfg: OrbitConfig, key: string | null | undefined) => Boolean(cfg.sources.find((s) => s.key === key)?.warm)
export const firstOpenStage = (cfg: OrbitConfig) => cfg.dealStages[0]
