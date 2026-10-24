import type { Metadata } from 'next'
import Link from 'next/link'
import { isValidObjectId } from 'mongoose'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/console/session'
import { requireWhatsAppPage } from '@/modules/features/flags'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { AssignSelect, CloseButton, ReplyBox } from '@/components/console/inbox-controls'
import { Org } from '@/models/Org'
import { Staff } from '@/models/console/Staff'
import { WaChatMessage } from '@/models/whatsapp/WaChatMessage'
import { WaConversation } from '@/models/whatsapp/WaConversation'
import { formatPhone } from '@/modules/whatsapp/phone'
import { canSendFreeText, windowMinutesLeft } from '@/modules/whatsapp/webhook-event'

export const metadata: Metadata = { title: 'Conversation' }

/** One WhatsApp conversation: thread, assignment and the reply box (console spec 10). */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const p = await requireStaff('accounts.view')
  await requireWhatsAppPage()
  if (!isValidObjectId(id)) notFound()
  const conversation = await p.raw(WaConversation).findById(id).lean()
  if (!conversation) notFound()
  const [messages, staff, orgs] = await Promise.all([
    p.raw(WaChatMessage).find({ conversationId: conversation._id }).sort({ at: 1 }).limit(300).lean(),
    p.raw(Staff).find({ status: 'active' }, { name: 1 }).sort({ name: 1 }).lean(),
    p.raw(Org).find({ _id: { $in: conversation.orgIds } }, { name: 1 }).lean(),
  ])
  if (conversation.unread) await p.raw(WaConversation).updateOne({ _id: conversation._id }, { $set: { unread: 0 } })
  const now = new Date()
  const stopped = Boolean(conversation.stoppedAt && (!conversation.lastInboundAt || conversation.stoppedAt >= conversation.lastInboundAt))
  const open = !stopped && canSendFreeText(conversation.lastInboundAt, now) && p.can('inbox.reply')
  const left = windowMinutesLeft(conversation.lastInboundAt, now)
  const reason = stopped ? 'They replied STOP: no WhatsApp messages. Use email.' : !p.can('inbox.reply') ? 'Your role cannot reply.' : open ? `Free text allowed for ${Math.floor(left / 60)} h ${left % 60} min more (24 hours after their last message).` : 'More than 24 hours since their last message: WhatsApp needs an approved template now. Reply by email instead.'
  return (
    <>
      <PageHeader
        title={conversation.name ?? formatPhone(conversation.phone)}
        description={`${formatPhone(conversation.phone)}${orgs.length ? ` · ${orgs.map((o) => o.name).join(', ')}` : ' · not linked to a workspace'}`}
        back={{ href: '/console/messages', label: 'Messages' }}
        actions={p.can('inbox.reply') ? <span className="flex items-center gap-2"><AssignSelect conversationId={id} current={conversation.assignedTo ? String(conversation.assignedTo) : null} staff={staff.map((s) => ({ value: String(s._id), label: s.name }))} /><CloseButton conversationId={id} closed={conversation.status === 'closed'} /></span> : null}
      />
      <section className="glass mx-auto max-w-3xl space-y-4 rounded-[14px] p-5">
        {orgs.length ? <p className="text-xs text-[#979797]">Workspaces: {orgs.map((o, i) => <span key={String(o._id)}>{i ? ', ' : ''}<Link href={`/console/accounts/${o._id}`} className="underline">{o.name}</Link></span>)}</p> : null}
        <ol className="space-y-2">
          {messages.map((m) => (
            <li key={String(m._id)} className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm', m.direction === 'in' ? 'bg-white/[0.06] text-white' : 'ml-auto bg-[#BB62A5]/25 text-white')}>
              <p className="whitespace-pre-line">{m.text}</p>
              <p className="mt-1 text-[11px] text-[#979797]">{m.direction === 'out' ? `${m.staffName ?? 'Flowbit'} · ${m.status}${m.error ? `: ${m.error}` : ''} · ` : ''}{formatDateTime(m.at)}</p>
            </li>
          ))}
        </ol>
        <ReplyBox conversationId={id} open={open} reason={reason} />
      </section>
    </>
  )
}
