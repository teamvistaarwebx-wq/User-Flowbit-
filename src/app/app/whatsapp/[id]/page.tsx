import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/ctx'
import { requireWhatsAppPage } from '@/modules/features/flags'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { ThreadAssign, ThreadAttach, ThreadClose, ThreadReply, type AttachableDoc } from '@/components/whatsapp/inbox-controls'
import { formatINR } from '@/lib/money'
import { Invoice } from '@/models/folio/Invoice'
import { Quote } from '@/models/folio/Quote'
import { connectionInfo } from '@/modules/whatsapp/connection'
import { Member } from '@/models/Member'
import { User } from '@/models/User'
import { WaThread } from '@/models/whatsapp/WaThread'
import { WaThreadMessage } from '@/models/whatsapp/WaThreadMessage'
import { formatPhone } from '@/modules/whatsapp/phone'
import { canSendFreeText, windowMinutesLeft } from '@/modules/whatsapp/webhook-event'

export const metadata: Metadata = { title: 'WhatsApp chat' }

const MATCH_HREF: Record<string, (id: string) => string> = { client: (id) => `/app/clients/${id}`, lead: (id) => `/app/orbit/leads/${id}`, member: () => '/app/settings/members' }

/** One chat in the workspace's WhatsApp inbox: thread, assignment, reply. */
export default async function WhatsAppThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireMember({ perm: 'clients.read' })
  await requireWhatsAppPage()
  if (!isValidObjectId(id)) notFound()
  const thread = await ctx.db(WaThread).findById(id).lean()
  if (!thread) notFound()
  const [messages, members] = await Promise.all([ctx.db(WaThreadMessage).find({ threadId: thread._id }).sort({ at: 1 }).limit(300).lean(), ctx.db(Member).find({ status: 'active' }, { userId: 1 }).lean()])
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1 }).sort({ name: 1 }).lean()
  const userName = new Map(users.map((u) => [String(u._id), u.name]))
  if (thread.unread) await ctx.db(WaThread).updateOne({ _id: thread._id }, { $set: { unread: 0 } })
  const now = new Date()
  const canReply = ctx.canAny('clients.write', 'activities.write', 'collections.write')
  const stopped = Boolean(thread.stoppedAt && (!thread.lastInboundAt || thread.stoppedAt >= thread.lastInboundAt))
  const inWindow = canSendFreeText(thread.lastInboundAt, now)
  const left = windowMinutesLeft(thread.lastInboundAt, now)
  const mode = stopped || !canReply ? 'none' : inWindow ? 'reply' : 'template'
  const reason = stopped ? 'They replied STOP: no WhatsApp messages until they write START.' : !canReply ? 'Your role cannot reply here.' : inWindow ? `Free text allowed for ${Math.floor(left / 60)} h ${left % 60} min more.` : 'More than 24 hours since their last message: WhatsApp allows only an approved template.'
  const matchHref = thread.match?.kind && thread.match.id ? MATCH_HREF[thread.match.kind]?.(String(thread.match.id)) : null
  const [info, docs] = await Promise.all([connectionInfo(ctx.orgId), mode === 'reply' || mode === 'template' ? clientDocs(ctx, thread.match) : Promise.resolve([])])
  return (
    <>
      <PageHeader
        title={thread.match?.label ?? thread.name ?? formatPhone(thread.phone)}
        description={formatPhone(thread.phone)}
        back={{ href: '/app/whatsapp', label: 'WhatsApp inbox' }}
        actions={canReply ? <span className="flex items-center gap-2"><ThreadAssign threadId={id} current={thread.assignedTo ? String(thread.assignedTo) : null} members={members.map((m) => ({ value: String(m._id), label: userName.get(String(m.userId)) ?? 'Member' }))} /><ThreadClose threadId={id} closed={thread.status === 'closed'} /></span> : null}
      />
      <section className="glass mx-auto max-w-3xl space-y-4 rounded-[14px] p-5">
        {matchHref ? <p className="text-xs text-[#979797]">Matched to <Link href={matchHref} className="underline">{thread.match?.label}</Link> ({thread.match?.kind})</p> : null}
        <ol className="space-y-2">
          {messages.map((m) => (
            <li key={String(m._id)} className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm', m.direction === 'in' ? 'bg-white/[0.06] text-white' : 'ml-auto bg-[#BB62A5]/25 text-white')}>
              <p className="whitespace-pre-line">{m.text}</p>
              <p className="mt-1 text-[11px] text-[#979797]">{m.direction === 'out' ? `${m.memberName ?? 'You'} · ${m.status}${m.error ? `: ${m.error}` : ''} · ` : ''}{formatDateTime(m.at)}</p>
            </li>
          ))}
        </ol>
        {mode !== 'none' ? <ThreadAttach threadId={id} docs={docs} /> : null}
        <ThreadReply threadId={id} mode={mode} reason={reason} canned={info.cannedReplies} />
      </section>
    </>
  )
}

/** Open invoices and live quotes of the client this chat is matched to (Folio only). */
async function clientDocs(ctx: Awaited<ReturnType<typeof requireMember>>, match: { kind?: string | null; id?: unknown } | null | undefined): Promise<AttachableDoc[]> {
  if (match?.kind !== 'client' || !match.id || !ctx.has('folio')) return []
  const [invoices, quotes] = await Promise.all([
    ctx.canAny('invoices.write', 'invoices.issue') ? ctx.db(Invoice).find({ clientId: match.id, status: { $in: ['issued', 'part_paid'] } }, { number: 1, balancePaise: 1 }).sort({ issueDate: -1 }).limit(10).lean() : [],
    ctx.can('quotes.write') ? ctx.db(Quote).find({ clientId: match.id, status: 'sent' }, { number: 1, totalPaise: 1 }).sort({ createdAt: -1 }).limit(10).lean() : [],
  ])
  return [
    ...invoices.map((i) => ({ kind: 'invoice' as const, id: String(i._id), label: `Invoice ${i.number ?? ''} · ${formatINR(i.balancePaise)} due` })),
    ...quotes.map((q) => ({ kind: 'quote' as const, id: String(q._id), label: `Quote ${q.number} · ${formatINR(q.totalPaise)}` })),
  ]
}
