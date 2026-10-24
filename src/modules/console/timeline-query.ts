import 'server-only'
import type { Types } from 'mongoose'
import type { StaffCtx } from '@/lib/console/session'
import { formatINR } from '@/lib/money'
import { AuditLog } from '@/models/AuditLog'
import { UsageEvent } from '@/models/console/UsageEvent'
import { ImportBatch } from '@/models/imports/ImportBatch'
import { Message } from '@/models/messaging/Message'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { mergeTimeline, usageDigest, type TimelineItem } from './timeline'

const DAY_MS = 86_400_000
const USAGE_DAYS = 30
const PLAN_ACTIONS = /^(platform\.|subscription\.|console\.)/

/** The account's timeline (signup, usage by day, plan changes, payments, messages, imports). */
export async function accountTimeline(p: StaffCtx, org: { _id: Types.ObjectId; createdAt: Date; name: string }): Promise<TimelineItem[]> {
  const db = p.forOrg(org._id).db
  const since = new Date(Date.now() - USAGE_DAYS * DAY_MS)
  const [usage, audits, invoices, messages, imports] = await Promise.all([
    p.raw(UsageEvent).aggregate<{ _id: { day: string; kind: TimelineUsageKind }; count: number }>([
      { $match: { orgId: org._id, at: { $gte: since } } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: 'Asia/Kolkata' } }, kind: '$kind' }, count: { $sum: 1 } } },
    ]),
    db(AuditLog).find({ action: PLAN_ACTIONS }, { action: 1, summary: 1, actorName: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(60).lean(),
    db(SubscriptionInvoice).find({}, { number: 1, totalPaise: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(30).lean(),
    db(Message).find({}, { channel: 1, subject: 1, title: 1, kind: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(40).lean(),
    db(ImportBatch).find({}, { label: 1, imported: 1, source: 1, actorName: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(30).lean(),
  ])
  return mergeTimeline([
    [{ at: new Date(org.createdAt), kind: 'signup', title: `${org.name} signed up` }],
    usageDigest(usage.map((u) => ({ day: u._id.day, kind: u._id.kind, count: u.count }))),
    audits.map((a) => ({ at: new Date(a.createdAt), kind: a.action.startsWith('console.') ? ('console' as const) : ('plan' as const), title: a.summary, detail: a.actorName ?? undefined })),
    invoices.map((i) => ({ at: new Date(i.createdAt), kind: 'payment' as const, title: `${i.status === 'due' ? 'Bill' : 'Invoice'} ${i.number}: ${formatINR(i.totalPaise, { decimals: 2 })}`, detail: i.status === 'cancelled' ? 'Cancelled' : i.status === 'due' ? 'Due' : 'Paid' })),
    messages.map((m) => ({ at: new Date(m.createdAt), kind: 'message' as const, title: m.subject || m.title || m.kind || 'Message', detail: `${m.channel} · ${m.status}` })),
    imports.map((b) => ({ at: new Date(b.createdAt), kind: 'import' as const, title: `${b.label}: ${b.imported} imported${b.status === 'undone' ? ' (undone)' : ''}`, detail: b.source === 'staff' ? `Flowbit team · ${b.actorName}` : b.actorName })),
  ])
}

type TimelineUsageKind = Parameters<typeof usageDigest>[0][number]['kind']
