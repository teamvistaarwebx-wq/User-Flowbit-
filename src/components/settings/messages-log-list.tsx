'use client'

import { useState } from 'react'
import { Paperclip, Send } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { TONE_TEXT } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KeyValue } from '@/components/ui/key-value'
import { Sheet } from '@/components/ui/sheet'
import { Tabs } from '@/components/ui/tabs'
import { Timeline } from '@/components/ui/timeline'
import { CHANNEL_LABEL, skipReasonLabel, statusMeta } from '@/modules/messaging/labels'
import { previewHtml } from '@/modules/settings/format'
import { resendMessage } from '@/modules/settings/workspace-actions'
import { cn } from '@/lib/utils'

export type MessageRow = {
  id: string
  when: string
  channel: 'email' | 'inapp' | 'whatsapp'
  to: string[]
  cc: string[]
  subject: string
  type: string
  status: string
  skipReason: string | null
  provider: string
  providerId: string
  error: string
  attempts: number
  nextAttempt: string | null
  html: string
  text: string
  href: string | null
  attachments: { filename: string; fileId: string | null; size: number }[]
  timeline: { at: string; status: string; note: string }[]
}

const recipients = (to: string[]) => (to.length > 1 ? `${to[0]} +${to.length - 1}` : (to[0] ?? '—'))
const COLS = 'sm:grid-cols-[8.5rem_13rem_1fr_6rem_9rem_8rem]'

/** The Messages log; a row opens the message in a side sheet: details, delivery timeline, preview and "Send again". */
export function MessagesLogList({ rows, canResend }: { rows: MessageRow[]; canResend: boolean }) {
  const [open, setOpen] = useState<MessageRow | null>(null)
  const [resend, resending] = useAction(resendMessage, { onDone: () => setOpen(null) })
  const resendable = open && canResend && !['scheduled', 'queued', 'sending'].includes(open.status) && open.skipReason !== 'digest'
  return (
    <>
      <div className="border-t border-line">
        <div aria-hidden className={cn('hidden h-[33px] items-center gap-3 border-b border-line px-[23px] text-sm text-white sm:grid', COLS)}>
          <span>When</span>
          <span>To</span>
          <span>Subject</span>
          <span>Channel</span>
          <span>Type</span>
          <span>Status</span>
        </div>
        <ul className="py-1.5">
          {rows.map((r) => {
            const s = statusMeta(r.status, r.skipReason)
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r)} className={cn('grid w-full grid-cols-[1fr_auto] items-center gap-3 px-[23px] py-2.5 text-left transition-colors hover:bg-white/[0.04] sm:h-11 sm:py-0', COLS)}>
                  <span className="hidden whitespace-nowrap text-xs tabular-nums text-[#979797] sm:block">{r.when}</span>
                  <span className="hidden truncate text-[13px] text-white sm:block">{recipients(r.to)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-white">{r.subject}</span>
                    <span className="block truncate text-xs text-[#979797] sm:hidden">
                      {CHANNEL_LABEL[r.channel]} · {recipients(r.to)} · {r.when}
                    </span>
                  </span>
                  <span className="hidden truncate text-[13px] text-[#979797] sm:block">{CHANNEL_LABEL[r.channel]}</span>
                  <span className="hidden truncate text-[13px] text-[#979797] sm:block">{r.type}</span>
                  <span title={r.error || skipReasonLabel(r.skipReason) || undefined} className={cn('whitespace-nowrap text-[13px] font-medium', TONE_TEXT[s.tone])}>
                    {s.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <Sheet
        open={open !== null}
        onOpenChange={(v) => !v && setOpen(null)}
        title={open?.subject ?? 'Message'}
        description={open ? `${CHANNEL_LABEL[open.channel]} · ${statusMeta(open.status, open.skipReason).label} · ${open.when}` : undefined}
        footer={
          resendable ? (
            <Button variant="primary" loading={resending} icon={<Send className="size-4" />} onClick={() => resend({ id: open.id })}>
              Send again
            </Button>
          ) : undefined
        }
      >
        {open ? <MessageDetail message={open} /> : null}
      </Sheet>
    </>
  )
}

function MessageDetail({ message }: { message: MessageRow }) {
  const skip = skipReasonLabel(message.skipReason)
  return (
    <div className="space-y-5">
      <KeyValue
        columns={1}
        items={[
          { label: 'To', value: message.to.join(', ') },
          { label: 'Cc', value: message.cc.join(', '), hidden: !message.cc.length },
          { label: 'Type', value: message.type },
          { label: 'Why it was skipped', value: <span className="text-warning">{skip}</span>, hidden: !skip },
          { label: 'Attempts', value: String(message.attempts), hidden: message.attempts < 2 },
          { label: 'Next try', value: message.nextAttempt ?? '', hidden: !message.nextAttempt },
          { label: 'Provider id', value: message.providerId, hidden: !message.providerId },
          { label: 'Error', value: <span className="text-[#FF6A66]">{message.error}</span>, hidden: !message.error || message.status === 'skipped' },
          { label: 'Links to', value: message.href ? <a href={message.href} className="text-link hover:underline">{message.href}</a> : '', hidden: !message.href },
        ]}
      />
      {message.attachments.length ? (
        <ul className="space-y-1.5">
          {message.attachments.map((a) => (
            <li key={a.filename} className="flex items-center gap-2 text-sm">
              <Paperclip className="size-4 text-icon-muted" />
              {a.fileId ? (
                <a href={`/api/files/${a.fileId}?download=1`} className="text-link hover:underline">{a.filename}</a>
              ) : (
                <span className="text-fg-2">{a.filename} (not stored)</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <Tabs
        items={[
          { value: 'timeline', label: 'Timeline', content: <Timeline className="pt-2" items={message.timeline.map((t, i) => ({ id: String(i), title: statusMeta(t.status).label, description: t.note || undefined, at: t.at }))} empty="No delivery events yet." /> },
          ...(message.html ? [{ value: 'html', label: 'Preview', content: <iframe title="Email preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={previewHtml(message.html)} className="h-[60vh] w-full rounded-[10px] bg-white ring-1 ring-inset ring-white/10" /> }] : []),
          { value: 'text', label: 'Plain text', content: <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-[10px] bg-control p-4 text-xs text-white/80">{message.text || 'No plain-text version.'}</pre> },
        ]}
      />
    </div>
  )
}
