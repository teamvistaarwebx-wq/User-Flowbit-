/**
 * The lead stage machine (ported from the reference CRM's database trigger).
 * Pure: the client uses it to explain a locked "Move to …" button, the server
 * re-checks every move with it. Funnel timestamps are computed from the OLD
 * values, never from input.
 */
import { LEAD_STAGE_LABEL, LEAD_STAGE_RANK, OPEN_LEAD_STAGES, isOpenLead, type LeadStage, type OpenLeadStage } from './constants'

export { LEAD_STAGE_RANK, OPEN_LEAD_STAGES, isOpenLead }

export type LeadMilestones = {
  stage: LeadStage
  contactedAt?: Date | null
  engagedAt?: Date | null
  meetingBookedAt?: Date | null
  meetingDoneAt?: Date | null
  convertedAt?: Date | null
  closedAt?: Date | null
  meetingAt?: Date | null
}

export type LeadEvidence = { hasOutreach: boolean; hasReply: boolean; hasMeetingHeld: boolean }

export type LeadTransitionInput = {
  lead: LeadMilestones
  to: LeadStage
  can: { write: boolean; close: boolean }
  evidence: LeadEvidence
  sourceIsWarm: boolean
  /** Active lost-reason keys from settings. */
  activeReasons: readonly string[]
  reasonCode?: string | null
  reasonNote?: string | null
  meetingAt?: Date | null
  /** Stage the lead was closed from (last closing StageEvent). */
  reopenTo?: LeadStage | null
  via: 'move' | 'convert' | 'reopen'
  now: Date
}

export type LeadPatch = {
  stage: LeadStage
  stageChangedAt: Date
  lastActivityAt: Date
  contactedAt?: Date
  engagedAt?: Date
  meetingBookedAt?: Date
  meetingAt?: Date
  meetingDoneAt?: Date
  convertedAt?: Date
  closedAt?: Date | null
  closeReason?: { code: string; note: string } | null
}

export type TransitionResult = { ok: true; to: LeadStage; patch: LeadPatch } | { ok: false; error: string }

const label = (s: LeadStage) => LEAD_STAGE_LABEL[s]

/** The next open stage, or null at Meeting done (convert from there). */
export function nextLeadStage(stage: LeadStage): OpenLeadStage | null {
  const i = (OPEN_LEAD_STAGES as readonly string[]).indexOf(stage)
  return i >= 0 && i < OPEN_LEAD_STAGES.length - 1 ? OPEN_LEAD_STAGES[i + 1] : null
}

function evidenceError(to: LeadStage, input: LeadTransitionInput): string | null {
  if (to === 'contacted' && !input.evidence.hasOutreach) return 'Log an outreach (DM, email or call) before marking this lead Contacted.'
  if (to === 'engaged' && !input.evidence.hasReply) return "Engaged means they replied. Log a 'Reply received' activity first."
  if (to === 'meeting_booked' && !(input.meetingAt ?? input.lead.meetingAt)) return 'Add the meeting date before marking Meeting booked.'
  if (to === 'meeting_done' && !input.evidence.hasMeetingHeld) return 'Log the meeting and its notes before marking Meeting done.'
  return null
}

function exitError(to: LeadStage, input: LeadTransitionInput): string | null {
  if (to === 'lost' && !input.can.close) return 'Only a reviewer can mark a lead Lost.'
  if (to === 'disqualified' && !input.can.write) return "You don't have permission to disqualify leads."
  if (!input.reasonCode || !input.activeReasons.includes(input.reasonCode)) return `Pick a reason before marking this lead ${label(to)}.`
  if (input.reasonCode === 'other' && !input.reasonNote?.trim()) return "Add a short note for 'Other'."
  return null
}

function buildPatch(to: LeadStage, input: LeadTransitionInput): LeadPatch {
  const t = input.now
  const old = input.lead
  const patch: LeadPatch = { stage: to, stageChangedAt: t, lastActivityAt: t }
  if (to === 'contacted') patch.contactedAt = old.contactedAt ?? t
  if (to === 'engaged') {
    patch.contactedAt = old.contactedAt ?? t
    patch.engagedAt = old.engagedAt ?? t
  }
  if (to === 'meeting_booked') {
    patch.meetingBookedAt = old.meetingBookedAt ?? t
    const at = input.meetingAt ?? old.meetingAt
    if (at) patch.meetingAt = at
  }
  if (to === 'meeting_done') patch.meetingDoneAt = old.meetingDoneAt ?? t
  if (to === 'converted') patch.convertedAt = old.convertedAt ?? t
  if (to === 'converted' || to === 'lost' || to === 'disqualified') patch.closedAt = old.closedAt ?? t
  if (to === 'lost' || to === 'disqualified') patch.closeReason = { code: input.reasonCode ?? 'other', note: input.reasonNote?.trim() ?? '' }
  if (isOpenLead(to)) {
    patch.closedAt = null
    patch.closeReason = null
  }
  return patch
}

/** Checks a lead stage change and returns the patch to apply, or the refusal in plain words. */
export function checkLeadTransition(input: LeadTransitionInput): TransitionResult {
  const from = input.lead.stage
  let to = input.to

  if (from === 'converted') return { ok: false, error: 'This lead is converted. Continue on the deal.' }
  if (from === 'lost' || from === 'disqualified') {
    if (input.via !== 'reopen' || !input.can.close) return { ok: false, error: 'This lead is closed. Ask your reviewer to reopen it.' }
    to = input.reopenTo && isOpenLead(input.reopenTo) ? input.reopenTo : 'new'
    const err = evidenceError(to, input)
    if (err) return { ok: false, error: err }
    return { ok: true, to, patch: buildPatch(to, input) }
  }
  if (input.via === 'reopen') return { ok: false, error: 'Only closed leads can be reopened.' }
  if (to === from) return { ok: false, error: `This lead is already ${label(from)}.` }
  if (to === 'converted' && input.via !== 'convert') return { ok: false, error: 'Use Convert to turn this lead into a client and a deal.' }
  if (input.via === 'convert') {
    if (to !== 'converted') return { ok: false, error: 'Use Convert to turn this lead into a client and a deal.' }
    if (from !== 'meeting_done') return { ok: false, error: 'Convert a lead after its meeting is done.' }
    if (!input.can.write) return { ok: false, error: "You don't have permission to convert leads." }
    return { ok: true, to, patch: buildPatch(to, input) }
  }
  if (to === 'lost' || to === 'disqualified') {
    const err = exitError(to, input)
    return err ? { ok: false, error: err } : { ok: true, to, patch: buildPatch(to, input) }
  }
  if (!input.can.write) return { ok: false, error: "You don't have permission to move leads." }

  const fromRank = LEAD_STAGE_RANK[from]
  const toRank = LEAD_STAGE_RANK[to]
  if (toRank < fromRank && !input.can.close) return { ok: false, error: "A lead can't move backwards. Ask your reviewer." }
  const warmSkip = from === 'new' && to === 'engaged' && input.sourceIsWarm
  if (toRank > fromRank + 1 && !warmSkip) {
    const next = nextLeadStage(from)
    return { ok: false, error: next ? `Move one step at a time: ${label(from)} → ${label(next)}.` : 'Move one step at a time.' }
  }
  const err = evidenceError(to, input)
  if (err) return { ok: false, error: err }
  return { ok: true, to, patch: buildPatch(to, input) }
}

/** Short reason the "Move to {next}" button is locked, or null when it can be pressed. */
export function blockedReason(args: { to: LeadStage; can: { write: boolean; close: boolean }; evidence: LeadEvidence; meetingAt?: Date | string | null }): string | null {
  if (!args.can.write) return "Only this lead's owner or reviewer can move it."
  if (args.to === 'contacted' && !args.evidence.hasOutreach) return 'Log a DM, email or call first.'
  if (args.to === 'engaged' && !args.evidence.hasReply) return "Log a 'Reply received' activity first."
  // Meeting booked and Meeting done are never locked: their dialogs collect the date or the notes.
  return null
}
