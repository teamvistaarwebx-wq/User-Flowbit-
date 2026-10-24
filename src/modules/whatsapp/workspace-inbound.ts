import { isStopKeyword } from '@/modules/messaging/consent'
import { normalizePhone } from './phone'
import type { InteraktEvent, InteraktInboundEvent, InteraktStatusEvent } from './webhook-event'

/**
 * A workspace's own webhook (WhatsApp B), pure orchestration with storage
 * injected. Everything is scoped to the workspace the webhook URL belongs
 * to: a status tick only moves that workspace's messages, an inbound message
 * lands in that workspace's inbox, and STOP suppresses the number for that
 * workspace only (other workspaces and Flowbit's own number are untouched).
 */

export type MatchKind = 'client' | 'lead' | 'member'
export type InboundMatch = Readonly<{ kind: MatchKind; id: string; label: string }>

export type MatchCandidate = Readonly<{ kind: MatchKind; id: string; label: string; phones: readonly (string | null | undefined)[] }>

const RANK: Readonly<Record<MatchKind, number>> = { client: 0, lead: 1, member: 2 }

/** The record a number belongs to: a client (or its billing contact) first, then a lead, then a member. */
export function matchInbound(phone: string, candidates: readonly MatchCandidate[]): InboundMatch | null {
  const target = normalizePhone(phone)
  if (!target) return null
  const hits = candidates.filter((c) => c.phones.some((p) => normalizePhone(p) === target))
  const best = [...hits].sort((a, b) => RANK[a.kind] - RANK[b.kind])[0]
  return best ? { kind: best.kind, id: best.id, label: best.label } : null
}

export const WORKSPACE_STOP_CONFIRM = (business: string) => `You will not get WhatsApp messages from ${business} any more. Reply START to receive them again.`

export const isStartKeyword = (text: string): boolean => /^\s*(start|unstop|subscribe)\s*[.!]*\s*$/i.test(text)

export type ThreadRef = Readonly<{ id: string; assignedTo: string | null }>

export type WorkspaceInboundDeps = Readonly<{
  /** Moves this workspace's message (by our id in callbackData, else the provider id) forward; refunds the wallet when it failed. */
  applyStatus: (orgId: string, event: InteraktStatusEvent) => Promise<'applied' | 'unknown'>
  /** Candidates whose stored phone could be this number (clients, billing contacts, leads, members). */
  candidates: (orgId: string, phone: string) => Promise<MatchCandidate[]>
  /** An unknown number: a new Orbit lead with source WhatsApp. */
  createLead: (orgId: string, event: InteraktInboundEvent) => Promise<InboundMatch | null>
  record: (orgId: string, event: InteraktInboundEvent, match: InboundMatch | null, flags: { stop: boolean; start: boolean }) => Promise<ThreadRef>
  suppress: (orgId: string, phone: string) => Promise<void>
  unsuppress: (orgId: string, phone: string) => Promise<void>
  reply: (orgId: string, thread: ThreadRef, phone: string, text: string) => Promise<void>
  /** The bell for the assignee (or whoever manages the inbox). */
  alert: (orgId: string, thread: ThreadRef, event: InteraktInboundEvent, match: InboundMatch | null) => Promise<void>
  businessName: (orgId: string) => Promise<string>
  /** Claims the provider message id for this workspace before anything happens (unique index): false for a redelivery. */
  claim?: (orgId: string, providerId: string) => Promise<boolean>
  /** Gives the claim back when handling failed, so the provider's retry runs. */
  release?: (orgId: string, providerId: string) => Promise<void>
  /** Buttons, their follow-ups and the employee bot: true when Flowbit answered the message itself. */
  converse?: (orgId: string, event: InteraktInboundEvent) => Promise<boolean>
}>

export type WorkspaceEventOutcome = 'applied' | 'unknown' | 'stored' | 'stopped' | 'started' | 'duplicate' | 'answered'

export async function handleWorkspaceEvent(deps: WorkspaceInboundDeps, orgId: string, event: InteraktEvent): Promise<WorkspaceEventOutcome> {
  if (event.kind === 'status') return deps.applyStatus(orgId, event)
  // A redelivery must not store the message twice, raise unread twice or re-send the paid STOP confirmation (V2-REVIEW P2).
  const id = event.providerId
  if (id && deps.claim && !(await deps.claim(orgId, id))) return 'duplicate'
  try {
    return await handleClaimedEvent(deps, orgId, event)
  } catch (error) {
    if (id && deps.release) await deps.release(orgId, id)
    throw error
  }
}

async function handleClaimedEvent(deps: WorkspaceInboundDeps, orgId: string, event: InteraktInboundEvent): Promise<WorkspaceEventOutcome> {
  const stop = isStopKeyword(event.text)
  const start = !stop && isStartKeyword(event.text)
  if (!stop && !start && deps.converse && (await deps.converse(orgId, event))) return 'answered'
  const found = matchInbound(event.phone, await deps.candidates(orgId, event.phone))
  const match = found ?? (await deps.createLead(orgId, event))
  const thread = await deps.record(orgId, event, match, { stop, start })
  if (stop) {
    await deps.suppress(orgId, event.phone)
    await deps.reply(orgId, thread, event.phone, WORKSPACE_STOP_CONFIRM(await deps.businessName(orgId)))
    return 'stopped'
  }
  if (start) {
    await deps.unsuppress(orgId, event.phone)
    return 'started'
  }
  await deps.alert(orgId, thread, event, match)
  return 'stored'
}
