import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { DocEvent } from '@/models/folio/DocEvent'
import { Message } from '@/models/messaging/Message'
import { liveDocLink } from './links'
import { buildDocTimeline, type DocEventType, type DocTimelineEntry } from './timeline'
import type { DocKind } from './token'

/** The document page's "Activity" card: sent, delivered, opened, accepted, paid; and its live public link. */

const ENTITY: Readonly<Record<DocKind, string>> = { invoice: 'Invoice', quote: 'Quote', credit_note: 'CreditNote', receipt: 'FolioReceipt', statement: 'Client' }

export type DocActivity = { entries: DocTimelineEntry[]; link: { url: string; opens: number; lastOpenedAt: Date | null } | null }

export async function documentActivity(ctx: Pick<Ctx, 'orgId' | 'db'>, kind: DocKind, docId: Types.ObjectId | string): Promise<DocActivity> {
  const [messages, events, link] = await Promise.all([
    ctx.db(Message).find({ entity: ENTITY[kind], entityId: String(docId), channel: { $ne: 'inapp' } }, { channel: 1, status: 1, to: 1, createdAt: 1, sentAt: 1, timeline: 1 }).sort({ createdAt: 1 }).limit(100).lean(),
    ctx.db(DocEvent).find({ kind, docId }, { type: 1, at: 1, name: 1, comment: 1, utr: 1, amountPaise: 1 }).sort({ at: 1 }).limit(200).lean(),
    liveDocLink(ctx.orgId, kind, docId),
  ])
  const entries = buildDocTimeline(
    messages.map((m) => ({ channel: m.channel, status: m.status, to: m.to, createdAt: (m as { createdAt: Date }).createdAt, sentAt: m.sentAt, timeline: m.timeline })),
    events.map((e) => ({ type: e.type as DocEventType, at: e.at, name: e.name, comment: e.comment, utr: e.utr, amountPaise: e.amountPaise })),
  )
  return { entries, link }
}
