/** Deal stage transitions (configurable open stages + fixed Won / Lost). Pure. */

export type DealStageRef = { key: string; label: string; probability: number }

export type DealTransitionInput = {
  deal: { stage: string; status: 'open' | 'won' | 'lost'; closedAt?: Date | null }
  to: string
  can: { write: boolean; close: boolean; isOwner: boolean }
  stages: readonly DealStageRef[]
  activeLostReasons?: readonly string[]
  activeWonReasons?: readonly string[]
  reasonCode?: string | null
  reasonNote?: string | null
  wonReason?: string | null
  /** Last open stage before it closed (from StageEvent). */
  reopenTo?: string | null
  via: 'move' | 'win' | 'lose' | 'reopen'
  now: Date
}

export type DealPatch = {
  stage: string
  status: 'open' | 'won' | 'lost'
  probability: number
  stageChangedAt: Date
  lastActivityAt: Date
  closedAt?: Date | null
  lostReason?: { code: string; note: string } | null
  wonReason?: string | null
}

export type DealTransitionResult = { ok: true; to: string; patch: DealPatch } | { ok: false; error: string }

export const dealStageLabel = (stages: readonly DealStageRef[], key: string) =>
  key === 'won' ? 'Won' : key === 'lost' ? 'Lost' : (stages.find((s) => s.key === key)?.label ?? key)

export function checkDealTransition(input: DealTransitionInput): DealTransitionResult {
  const { deal, stages, can, now: t } = input
  const base = { stageChangedAt: t, lastActivityAt: t }

  if (deal.status !== 'open') {
    if (input.via !== 'reopen' || !can.close) return { ok: false, error: 'This deal is closed. Ask a reviewer to reopen it.' }
    const target = stages.find((s) => s.key === input.reopenTo) ?? stages[0]
    if (!target) return { ok: false, error: 'Add a deal stage in Orbit settings first.' }
    return { ok: true, to: target.key, patch: { ...base, stage: target.key, status: 'open', probability: target.probability, closedAt: null, lostReason: null, wonReason: null } }
  }
  if (input.via === 'reopen') return { ok: false, error: 'Only closed deals can be reopened.' }
  if (input.to === deal.stage) return { ok: false, error: `This deal is already in ${dealStageLabel(stages, deal.stage)}.` }

  if (input.via === 'win' || input.to === 'won') {
    if (!can.close) return { ok: false, error: 'Only a reviewer can mark a deal Won.' }
    if (input.wonReason && !(input.activeWonReasons ?? []).includes(input.wonReason)) return { ok: false, error: 'Pick a won reason from the list.' }
    return { ok: true, to: 'won', patch: { ...base, stage: 'won', status: 'won', probability: 100, closedAt: t, wonReason: input.wonReason ?? null, lostReason: null } }
  }
  if (input.via === 'lose' || input.to === 'lost') {
    if (!can.close) return { ok: false, error: 'Only a reviewer can mark a deal Lost.' }
    if (!input.reasonCode || !(input.activeLostReasons ?? []).includes(input.reasonCode)) return { ok: false, error: 'Pick a reason before marking this deal Lost.' }
    if (input.reasonCode === 'other' && !input.reasonNote?.trim()) return { ok: false, error: "Add a short note for 'Other'." }
    return { ok: true, to: 'lost', patch: { ...base, stage: 'lost', status: 'lost', probability: 0, closedAt: t, lostReason: { code: input.reasonCode, note: input.reasonNote?.trim() ?? '' }, wonReason: null } }
  }

  const target = stages.find((s) => s.key === input.to)
  if (!target) return { ok: false, error: 'That stage no longer exists. Refresh the page.' }
  if (!can.close && !(can.write && can.isOwner)) return { ok: false, error: 'Only the deal owner or a reviewer can move this deal.' }
  return { ok: true, to: target.key, patch: { ...base, stage: target.key, status: 'open', probability: target.probability } }
}
