import type { Metadata } from 'next'
import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { dayBoundsIST, formatDateTime } from '@/lib/dates'
import { isResendConfigured } from '@/lib/env'
import { parseListParams, type SearchParams } from '@/lib/list'
import { escapeRegex } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { MessagesLogList, type MessageRow } from '@/components/settings/messages-log-list'
import { Notice, TableCard } from '@/components/settings/surface'
import { UrlDate } from '@/components/settings/url-date'
import { UrlSelect } from '@/components/settings/url-select'
import { Message } from '@/models/messaging/Message'
import { groupByKey } from '@/modules/messaging/events'
import { CHANNEL_LABEL, STATUS_META, kindLabel, typeFilter, typeOptions } from '@/modules/messaging/labels'
import { hasUnmigratedOutbox, migrateOutboxBatch } from '@/modules/messaging/migrate-outbox'
import { hiddenMailKinds } from '@/modules/settings/email-log-access'

export const metadata: Metadata = { title: 'Messages log' }
const BASE = '/app/settings/messages'
const ISO = /^\d{4}-\d{2}-\d{2}$/
const CHANNELS = ['email', 'inapp', 'whatsapp'] as const
const MAX_MIGRATION_BATCHES = 5

/** Copies this workspace's old Email log rows in, so the history is here the first time the page opens. */
async function catchUpHistory(orgId: Parameters<typeof migrateOutboxBatch>[0]) {
  for (let i = 0; i < MAX_MIGRATION_BATCHES && orgId && (await hasUnmigratedOutbox(orgId)); i++) await migrateOutboxBatch(orgId)
}

export default async function MessagesLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ perm: 'org.manage' })
  await catchUpHistory(ctx.orgId).catch((error) => console.error('[messages] Outbox catch-up failed', error))
  const p = parseListParams(sp, { pageSize: 50 })
  const channel = p.get('channel')
  const status = p.get('status')
  const type = p.get('type')
  const from = p.get('from')
  const to = p.get('to')
  const q = p.q ? new RegExp(escapeRegex(p.q), 'i') : null
  const createdAt = { ...(from && ISO.test(from) ? { $gte: dayBoundsIST(from).start } : {}), ...(to && ISO.test(to) ? { $lt: dayBoundsIST(to).end } : {}) }
  const hidden = hiddenMailKinds(ctx)
  const byType = typeFilter(type)
  const filter = {
    ...(channel && (CHANNELS as readonly string[]).includes(channel) ? { channel } : {}),
    ...(status ? { status } : {}),
    ...byType,
    kind: byType.kind && !hidden.includes(byType.kind) ? byType.kind : { $nin: hidden },
    ...(q ? { $or: [{ subject: q }, { title: q }, { to: q }] } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
  }
  const [messages, total] = await Promise.all([
    ctx.db(Message).find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.pageSize).lean(),
    ctx.db(Message).countDocuments(filter),
  ])
  const rows: MessageRow[] = messages.map((m) => ({
    id: String(m._id),
    when: formatDateTime(m.createdAt),
    channel: (m.channel as MessageRow['channel']) ?? 'email',
    to: [...m.to],
    cc: [...(m.cc ?? [])],
    subject: m.subject ?? m.title ?? '(no subject)',
    type: m.group && m.kind === 'alert' ? groupByKey(m.group).label : kindLabel(m.kind ?? 'other'),
    status: m.status ?? 'queued',
    skipReason: m.skipReason ?? null,
    provider: m.provider ?? '',
    providerId: m.providerId ?? '',
    error: m.error ?? '',
    attempts: m.attempts ?? 0,
    nextAttempt: m.nextAttemptAt && (m.status === 'queued' || m.status === 'scheduled') ? formatDateTime(m.nextAttemptAt) : m.digestAt && m.status === 'scheduled' ? formatDateTime(m.digestAt) : null,
    html: m.html ?? '',
    text: m.text ?? m.body ?? '',
    href: m.href ?? null,
    attachments: (m.attachments ?? []).map((a) => ({ filename: a.filename ?? 'attachment', fileId: a.fileId ? String(a.fileId) : null, size: a.size ?? 0 })),
    timeline: (m.timeline ?? []).map((t) => ({ at: new Date(t.at).toISOString(), status: t.status, note: t.note ?? '' })),
  }))
  const filtered = Boolean(channel || status || type || p.q || from || to)

  return (
    <>
      <PageHeader title="Messages log" description="Every email, in-app and WhatsApp message Flowbit sent, held or skipped for this workspace, with its delivery timeline." breadcrumb={breadcrumbFor(BASE)} />
      {!isResendConfigured() ? (
        <Notice tone="warning" className="mb-4">
          No email provider is set up, so emails are saved here but not sent.
        </Notice>
      ) : null}
      <TableCard
        icon={<MessagesSquare strokeWidth={1.5} />}
        label="Messages"
        description={`${total} ${total === 1 ? 'message' : 'messages'}${filtered ? ' match these filters' : ''}`}
        toolbar={
          <>
            <SearchInput placeholder="Search recipient or subject" />
            <UrlSelect param="channel" label="Channel" options={[{ value: 'all', label: 'Any channel' }, ...CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))]} />
            <UrlSelect param="status" label="Status" options={[{ value: 'all', label: 'Any status' }, ...Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label }))]} />
            <UrlSelect param="type" label="Type" options={[{ value: 'all', label: 'Any type' }, ...typeOptions(hidden)]} />
            <div className="flex flex-wrap items-center gap-2">
              <UrlDate param="from" label="From" />
              <UrlDate param="to" label="To" />
            </div>
          </>
        }
      >
        {rows.length ? (
          <MessagesLogList rows={rows} canResend={ctx.can('org.manage')} />
        ) : (
          <div className="border-t border-line">
            {filtered ? (
              <EmptyState compact icon={<MessagesSquare />} title="No messages match these filters." action={<Link href={BASE} className={buttonClass('secondary')}>Clear filters</Link>} />
            ) : (
              <EmptyState icon={<MessagesSquare />} title="No messages yet" description={`Alerts, briefs, invites, payslips and invoices sent from ${ctx.org.name} appear here.`} />
            )}
          </div>
        )}
      </TableCard>
      {rows.length ? <Pagination page={p.page} pageSize={p.pageSize} total={total} basePath={BASE} params={sp} /> : null}
    </>
  )
}
