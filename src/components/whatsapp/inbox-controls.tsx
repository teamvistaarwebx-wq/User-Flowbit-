'use client'

import { useState } from 'react'
import { Archive, ArchiveRestore, FileText, Paperclip, Send } from 'lucide-react'
import { ActionForm, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { assignThreadAction, replyThreadAction, sendThreadDocAction, sendThreadTemplateAction, setThreadStatusAction } from '@/modules/whatsapp/inbox-actions'

/** Workspace WhatsApp inbox controls: assign, close, reply (24-hour window) or the follow-up template. */

export function ThreadAssign({ threadId, current, members }: { threadId: string; current: string | null; members: { value: string; label: string }[] }) {
  const [assign, pending] = useAction(assignThreadAction)
  return <Select aria-label="Assigned to" size="sm" disabled={pending} value={current ?? 'none'} onValueChange={(memberId) => void assign({ threadId, memberId })} options={[{ value: 'none', label: 'Unassigned' }, ...members]} />
}

export function ThreadClose({ threadId, closed }: { threadId: string; closed: boolean }) {
  const [set, pending] = useAction(setThreadStatusAction)
  return <Button size="sm" variant="ghost" loading={pending} icon={closed ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={() => void set({ threadId, status: closed ? 'open' : 'closed' })}>{closed ? 'Reopen' : 'Close'}</Button>
}

export type CannedReply = { id: string; title: string; text: string }
export type AttachableDoc = { kind: 'invoice' | 'quote'; id: string; label: string }

/** Pick an open invoice or quote of the matched client and send it as the document template (PDF + link). */
export function ThreadAttach({ threadId, docs }: { threadId: string; docs: readonly AttachableDoc[] }) {
  const [send, sending] = useAction(sendThreadDocAction)
  const [pick, setPick] = useState(docs[0] ? `${docs[0].kind}:${docs[0].id}` : '')
  if (!docs.length) return null
  const [kind, id] = pick.split(':') as [AttachableDoc['kind'], string]
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <NativeSelect className="sm:max-w-sm" value={pick} onChange={(e) => setPick(e.target.value)} options={docs.map((d) => ({ value: `${d.kind}:${d.id}`, label: d.label }))} aria-label="Document to send" />
      <Button size="sm" variant="secondary" icon={<Paperclip className="size-4" />} loading={sending} onClick={() => void send({ threadId, kind, id })}>Send document</Button>
    </div>
  )
}

export function ThreadReply({ threadId, mode, reason, canned = [] }: { threadId: string; mode: 'reply' | 'template' | 'none'; reason: string; canned?: readonly CannedReply[] }) {
  const [sendTemplate, sending] = useAction(sendThreadTemplateAction)
  const [text, setText] = useState('')
  if (mode === 'none') return <p className="rounded-xl border border-line px-4 py-3 text-sm text-fg-2">{reason}</p>
  if (mode === 'template') {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-2">{reason}</p>
        <Button size="sm" variant="primary" loading={sending} icon={<FileText className="size-4" />} onClick={() => void sendTemplate({ threadId })}>Send follow-up template</Button>
      </div>
    )
  }
  return (
    <ActionForm action={replyThreadAction} resetOnSuccess onDone={() => setText('')} className="space-y-2">
      <input type="hidden" name="threadId" value={threadId} />
      {canned.length ? (
        <NativeSelect value="" onChange={(e) => setText(canned.find((c) => c.id === e.target.value)?.text ?? text)} placeholder="Insert a saved reply…" options={canned.map((c) => ({ value: c.id, label: c.title }))} aria-label="Saved replies" />
      ) : null}
      <Textarea name="text" rows={3} maxLength={1000} placeholder="Write a reply…" aria-label="Reply" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[#979797]">{reason}</span>
        <SubmitButton pendingLabel="Sending…" icon={<Send className="size-4" />}>Send</SubmitButton>
      </div>
    </ActionForm>
  )
}
