import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { dbConnect } from '@/lib/db'
import { isInboundEmailConfigured, serverEnv } from '@/lib/env'
import type { SystemDb } from '@/lib/platform'
import { bareEmail, sameToken } from '@/modules/connectors/email/address'
import type { InboundEmail } from '@/modules/connectors/email/adapter'
import { gmailThread, type GmailThreadMessage } from '@/modules/google/client'
import { accessTokenFor } from '@/modules/google/connections'
import { listPeople } from '@/modules/work/teams/people'
import { Activity } from '@/models/orbit/Activity'
import { Lead } from '@/models/orbit/Lead'
import { SequenceEnrollment } from '@/models/orbit/SequenceEnrollment'
import { enrollmentReplyAddress, enrollmentReplySig, looksAutomatic, parseEnrollmentReply, threadHasReply } from './reply-rules'
import { exitLeadEnrollments } from './store'

type Scope = Pick<Ctx, 'db'>

/** Whether Gmail reply detection (gmail.readonly) is switched on for this server. */
export const gmailReplyDetectionOn = (): boolean => serverEnv().GMAIL_REPLY_DETECTION === 'true'

/** This enrolment's own reply address, or null when inbound email is not set up. */
export function replyAddressFor(enrollmentId: Types.ObjectId | string): string | null {
  if (!isInboundEmailConfigured()) return null
  const env = serverEnv()
  return enrollmentReplyAddress(env.APP_SECRET, String(enrollmentId), env.INBOUND_EMAIL_DOMAIN)
}

/** Stops the lead's sequence and logs the reply on the lead (no stage move: the owner decides that). */
async function recordReply(scope: Scope, lead: { _id: Types.ObjectId; clientId?: Types.ObjectId | null }, senderId: Types.ObjectId, note: string, now: Date): Promise<boolean> {
  const stopped = await exitLeadEnrollments(scope, [lead._id], 'replied', now)
  if (!stopped) return false
  await logReply(scope, lead, senderId, note, now)
  return true
}

async function logReply(scope: Scope, lead: { _id: Types.ObjectId; clientId?: Types.ObjectId | null }, senderId: Types.ObjectId, note: string, now: Date): Promise<void> {
  await scope.db(Activity).create({ leadId: lead._id, clientId: lead.clientId ?? null, type: 'reply', status: 'done', channel: 'email', title: 'Replied to the sequence', notes: note, occurredAt: now, assigneeId: senderId, createdBy: senderId })
  await scope.db(Lead).updateOne({ _id: lead._id }, { $set: { lastActivityAt: now } })
}

export type ReplyOutcome = { status: 'replied'; leads: number } | { status: 'rejected'; reason: string }

/** True when the inbound mail is addressed to an enrolment's reply address (so the email-to-task handler leaves it alone). */
export const isReplyInboxMail = (mail: InboundEmail): boolean => Boolean(parseEnrollmentReply(mail.to, serverEnv().INBOUND_EMAIL_DOMAIN))

type ReplyDb = Pick<SystemDb, 'raw' | 'forOrg'>

/**
 * A reply that reached an enrolment's own reply address: the signature must
 * match, and only that enrolment stops (other leads and other sequences of
 * the same lead keep running).
 */
export async function handleSequenceReply(mail: InboundEmail, db: ReplyDb, now: Date = new Date()): Promise<ReplyOutcome> {
  const env = serverEnv()
  const address = parseEnrollmentReply(mail.to, env.INBOUND_EMAIL_DOMAIN)
  if (!address || !sameToken(enrollmentReplySig(env.APP_SECRET, address.enrollmentId), address.sig)) return { status: 'rejected', reason: 'unknown reply address' }
  if (looksAutomatic(mail.subject)) return { status: 'rejected', reason: 'automatic reply' }
  await dbConnect()
  const enrollment = await db.raw(SequenceEnrollment).findOne({ _id: address.enrollmentId }, { orgId: 1, leadId: 1, senderId: 1, status: 1 }).lean()
  if (!enrollment) return { status: 'rejected', reason: 'unknown reply address' }
  if (enrollment.status !== 'active') return { status: 'rejected', reason: 'the sequence has already ended' }
  const scope = db.forOrg(enrollment.orgId)
  const stopped = await scope.db(SequenceEnrollment).updateOne({ _id: enrollment._id, status: 'active' }, { $set: { status: 'exited', exitReason: 'replied', finishedAt: now, claimedUntil: null } })
  if (!stopped.modifiedCount) return { status: 'rejected', reason: 'the sequence has already ended' }
  const lead = await scope.db(Lead).findOne({ _id: enrollment.leadId }, { _id: 1, clientId: 1 }).lean()
  const from = bareEmail(mail.from)
  if (lead) await logReply(scope, lead, enrollment.senderId, `Reply received${from ? ` from ${from}` : ''}: "${mail.subject.slice(0, 120)}"`, now)
  return { status: 'replied', leads: 1 }
}

const GMAIL_BATCH = 200

type GmailReader = (token: string, threadId: string) => Promise<GmailThreadMessage[]>

/**
 * Gmail reply detection (GMAIL_REPLY_DETECTION=true): for live enrolments with
 * Gmail-sent steps whose sender connected Gmail read access, a thread with a
 * human reply from anyone but the sender stops the sequence. Read errors skip
 * that enrolment until the next run.
 */
export async function checkGmailReplies(db: SystemDb, now: Date = new Date(), read: GmailReader = gmailThread): Promise<{ checked: number; replied: number }> {
  if (!gmailReplyDetectionOn()) return { checked: 0, replied: 0 }
  const rows = await db.raw(SequenceEnrollment).find({ status: 'active', 'history.threadId': { $exists: true } }, { orgId: 1, leadId: 1, senderId: 1, history: 1 }).sort({ replyCheckedAt: 1 }).limit(GMAIL_BATCH).lean()
  const tokens = new Map<string, string | null>()
  let checked = 0
  let replied = 0
  for (const e of rows) {
    const scope = db.forOrg(e.orgId)
    const key = `${e.orgId}:${e.senderId}`
    if (!tokens.has(key)) tokens.set(key, await accessTokenFor(scope, e.senderId, 'gmail_read').catch(() => null))
    const token = tokens.get(key)
    if (!token) continue
    const [sender] = await listPeople(scope, [e.senderId])
    const threads = [...new Set(e.history.map((h) => h.threadId).filter((t): t is string => Boolean(t)))]
    checked += 1
    await scope.db(SequenceEnrollment).updateOne({ _id: e._id }, { $set: { replyCheckedAt: now } })
    for (const threadId of threads) {
      const messages = await read(token, threadId).catch(() => null)
      if (!messages || !threadHasReply(messages, sender?.email ?? '')) continue
      const lead = await scope.db(Lead).findOne({ _id: e.leadId }, { _id: 1, clientId: 1 }).lean()
      if (lead && (await recordReply(scope, lead, e.senderId, 'Reply found in the Gmail thread', now))) replied += 1
      break
    }
  }
  return { checked, replied }
}
