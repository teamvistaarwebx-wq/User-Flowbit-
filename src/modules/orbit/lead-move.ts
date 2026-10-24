import 'server-only'
import type { ClientSession, Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { withTransaction } from '@/lib/db'
import { istInstant } from '@/lib/dates'
import { UserError } from '@/lib/errors'
import { Activity } from '@/models/orbit/Activity'
import { Lead } from '@/models/orbit/Lead'
import { LEAD_STAGE_LABEL, OUTREACH_TYPES, type LeadStage } from './constants'
import { checkLeadTransition, type LeadEvidence } from './leadStage'
import { cancelPlannedOnClose, refreshNextFollowUp, recordStage, stageBeforeClose } from './next-step'
import { canEditLead, type LeadDoc } from './scope'
import { exitForMove } from './sequences/rules'
import { exitLeadEnrollments } from './sequences/store'
import { activeKeys, isWarmSource, type OrbitConfig } from './settings'

export const DEFAULT_MEETING_TIME = '11:00'

export async function leadEvidence(ctx: Ctx, leadId: Types.ObjectId): Promise<LeadEvidence> {
  const A = ctx.db(Activity)
  const [outreach, reply, meeting] = await Promise.all([
    A.exists({ leadId, status: 'done', type: { $in: [...OUTREACH_TYPES] } }),
    A.exists({ leadId, status: 'done', type: 'reply' }),
    A.exists({ leadId, status: 'done', type: 'meeting' }),
  ])
  return { hasOutreach: Boolean(outreach), hasReply: Boolean(reply), hasMeetingHeld: Boolean(meeting) }
}

export type MoveParams = {
  to: LeadStage
  via: 'move' | 'reopen'
  reasonCode?: string
  reasonNote?: string
  meeting?: { date: string; time?: string; link?: string }
  meetingNotes?: string
}

/**
 * Runs one guarded lead stage change: evidence, the stage machine, optimistic
 * concurrency on the old stage, the stage event and follow-up refresh, all in
 * one transaction. Throws UserError with the guard's words on refusal.
 */
export async function applyLeadMove(ctx: Ctx, lead: LeadDoc, cfg: OrbitConfig, p: MoveParams): Promise<LeadStage> {
  if (!canEditLead(ctx, lead)) throw new UserError("Only this lead's owner or reviewer can move it.")
  const evidence = await leadEvidence(ctx, lead._id)
  const logsMeeting = p.to === 'meeting_done' && !evidence.hasMeetingHeld && Boolean(p.meetingNotes)
  const meetingAt = p.meeting ? istInstant(p.meeting.date, p.meeting.time ?? DEFAULT_MEETING_TIME) : null
  const reopenTo = p.via === 'reopen' ? ((await stageBeforeClose(ctx, 'lead', lead._id, ['lost', 'disqualified'])) as LeadStage | null) : null
  const now = new Date()
  const res = checkLeadTransition({
    lead: lead as Parameters<typeof checkLeadTransition>[0]['lead'],
    to: p.to,
    can: { write: ctx.can('leads.write'), close: ctx.can('orbit.close') },
    evidence: { ...evidence, hasMeetingHeld: evidence.hasMeetingHeld || logsMeeting },
    sourceIsWarm: isWarmSource(cfg, lead.source),
    activeReasons: activeKeys(cfg.lostReasons),
    reasonCode: p.reasonCode,
    reasonNote: p.reasonNote,
    meetingAt,
    reopenTo,
    via: p.via,
    now,
  })
  if (!res.ok) throw new UserError(res.error, missingMeetingField(p, lead, evidence.hasMeetingHeld || logsMeeting, meetingAt))

  await withTransaction(async (session) => {
    if (logsMeeting) await logMeetingNotes(ctx, lead, p.meetingNotes ?? '', now, session)
    const updated = await ctx.db(Lead).findOneAndUpdate({ _id: lead._id, stage: lead.stage }, { $set: res.patch }, { session })
    if (!updated) throw new UserError('This lead changed while you were looking at it. Refresh and try again.')
    await recordStage(ctx, { entity: 'lead', entityId: lead._id, fromStage: lead.stage, toStage: res.to, reasonCode: res.patch.closeReason?.code, reasonNote: res.patch.closeReason?.note, at: now }, session)
    if (res.to === 'meeting_booked' && p.meeting) {
      await ctx.db(Activity).create(
        {
          leadId: lead._id, clientId: lead.clientId, type: 'meeting', status: 'planned', channel: 'video',
          title: `Meeting with ${lead.contactName || lead.companyName}`, dueDate: p.meeting.date, dueTime: p.meeting.time ?? DEFAULT_MEETING_TIME,
          meetingLink: p.meeting.link ?? null, assigneeId: lead.ownerId, createdBy: ctx.memberId,
        },
        { session },
      )
    }
    if (res.to === 'lost' || res.to === 'disqualified') await cancelPlannedOnClose(ctx, { leadId: lead._id }, `Lead ${LEAD_STAGE_LABEL[res.to].toLowerCase()}`, now, session)
    await refreshNextFollowUp(ctx, { leadId: lead._id }, session)
  })
  // A converted, lost or disqualified lead leaves its follow-up sequence, and so does one that replied (moved to Engaged).
  const exitReason = exitForMove(lead.stage, res.to)
  if (exitReason) await exitLeadEnrollments(ctx, [lead._id], exitReason, now)
  return res.to
}

/** Points a refused Meeting booked / Meeting done move at the dialog field that is missing. */
function missingMeetingField(p: MoveParams, lead: LeadDoc, meetingHeld: boolean, meetingAt: Date | null): Record<string, string> | undefined {
  if (p.to === 'meeting_booked' && !meetingAt && !lead.meetingAt) return { meetingDate: 'Pick the meeting date' }
  if (p.to === 'meeting_done' && !meetingHeld && !p.meetingNotes?.trim()) return { meetingNotes: 'Add what was discussed' }
  return undefined
}

/** Completes the earliest planned meeting with these notes, or logs a new held meeting. */
async function logMeetingNotes(ctx: Ctx, lead: LeadDoc, notes: string, now: Date, session: ClientSession) {
  const planned = await ctx.db(Activity).findOne({ leadId: lead._id, status: 'planned', type: 'meeting' }, null, { session }).sort({ dueDate: 1, dueTime: 1 })
  if (planned) {
    await ctx.db(Activity).updateOne({ _id: planned._id }, { $set: { status: 'done', notes, occurredAt: now, completedAt: now } }, { session })
    return
  }
  await ctx.db(Activity).create({ leadId: lead._id, clientId: lead.clientId, type: 'meeting', status: 'done', channel: 'video', title: '', notes, occurredAt: now, assigneeId: ctx.memberId, createdBy: ctx.memberId }, { session })
}

export const stageWords = (to: LeadStage) => LEAD_STAGE_LABEL[to]
