'use client'

import { Archive, ArchiveRestore, Send } from 'lucide-react'
import { ActionForm, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { assignConversation, replyToConversation, setConversationStatus } from '@/modules/whatsapp/console-actions'

/** Inbox thread controls: assign, close, and the reply box (free text only inside the 24-hour window). */

export function AssignSelect({ conversationId, current, staff }: { conversationId: string; current: string | null; staff: { value: string; label: string }[] }) {
  const [assign, pending] = useAction(assignConversation)
  return <Select aria-label="Assigned to" size="sm" disabled={pending} value={current ?? 'none'} onValueChange={(staffId) => void assign({ conversationId, staffId })} options={[{ value: 'none', label: 'Unassigned (auto-reply on)' }, ...staff]} />
}

export function CloseButton({ conversationId, closed }: { conversationId: string; closed: boolean }) {
  const [set, pending] = useAction(setConversationStatus)
  return <Button size="sm" variant="ghost" loading={pending} icon={closed ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={() => void set({ conversationId, status: closed ? 'open' : 'closed' })}>{closed ? 'Reopen' : 'Close'}</Button>
}

export function ReplyBox({ conversationId, open, reason }: { conversationId: string; open: boolean; reason: string }) {
  if (!open) return <p className="rounded-xl border border-line px-4 py-3 text-sm text-fg-2">{reason}</p>
  return (
    <ActionForm action={replyToConversation} resetOnSuccess className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <Textarea name="text" rows={3} maxLength={1000} placeholder="Write a reply…" aria-label="Reply" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[#979797]">{reason}</span>
        <SubmitButton pendingLabel="Sending…" icon={<Send className="size-4" />}>Send</SubmitButton>
      </div>
    </ActionForm>
  )
}
