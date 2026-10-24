'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { MentionTextarea } from './mention-textarea'
import { useTaskData } from './task-data'

export type BlockedReason = { reason: string; mentionIds: string[] }

/** "Why is this blocked?" — asked before a task moves to Blocked. @mentions notify those people. */
export function BlockedDialog({ open, taskTitle, onCancel, onConfirm, pending }: { open: boolean; taskTitle?: string; onCancel: () => void; onConfirm: (value: BlockedReason) => void; pending?: boolean }) {
  const { people } = useTaskData()
  const [reason, setReason] = useState('')
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const close = () => {
    setReason('')
    setMentionIds([])
    onCancel()
  }
  const confirm = () => {
    if (!reason.trim()) return
    onConfirm({ reason: reason.trim(), mentionIds })
    setReason('')
    setMentionIds([])
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="Why is this blocked?"
      description={taskTitle ? `'${taskTitle}' moves to Blocked. Type @ to tell someone.` : 'Type @ to tell someone.'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} loading={pending} disabled={!reason.trim()}>
            Mark blocked
          </Button>
        </>
      }
    >
      <MentionTextarea
        value={reason}
        onChange={(text, ids) => {
          setReason(text)
          setMentionIds(ids)
        }}
        people={people}
        placeholder="Waiting for the client's logo files…"
        autoFocus
        onSubmit={confirm}
        aria-label="Blocked reason"
      />
    </Dialog>
  )
}
