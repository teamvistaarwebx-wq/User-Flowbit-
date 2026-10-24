'use client'

import { useState, type ReactNode } from 'react'
import type { ActionResult } from '@/lib/action-types'
import { toast } from '@/lib/toast'
import { thrownErrorMessage } from '@/lib/user-errors'
import { Button } from './button'
import { Dialog } from './dialog'
import { Textarea } from './input'

export type ConfirmDialogProps = {
  trigger: ReactNode
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  /**
   * Runs on confirm. Return an ActionResult to get the toast/sound handled;
   * the dialog closes on success and stays open on refusal.
   */
  onConfirm: (reason?: string) => Promise<ActionResult<unknown> | void> | ActionResult<unknown> | void
  /** Ask for a reason (void/cancel/revoke flows). */
  reason?: { label: string; placeholder?: string; required?: boolean }
}

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog({ trigger, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger', onConfirm, reason }: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [text, setText] = useState('')
  const missingReason = Boolean(reason?.required && !text.trim())

  const run = async () => {
    setPending(true)
    try {
      const result = await onConfirm(reason ? text.trim() : undefined)
      if (result && !result.ok) {
        toast.error(result.error)
        return
      }
      if (result?.message) toast.success(result.message)
      setOpen(false)
      setText('')
    } catch (error) {
      // Thrown errors are transport or framework failures; their text is not for users.
      toast.error(thrownErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={run} loading={pending} disabled={missingReason}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {reason ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-fg">
            {reason.label}
            {reason.required ? <span className="text-[#F64A45]">*</span> : null}
          </span>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} rows={3} />
        </label>
      ) : null}
    </Dialog>
  )
}
