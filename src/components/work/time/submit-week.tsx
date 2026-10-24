'use client'

import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatDuration } from '@/lib/dates'
import { submitWeek } from '@/modules/work/time/approval-actions'

export function SubmitWeekButton({ weekStart, label, total }: { weekStart: string; label: string; total: number }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="primary" icon={<Send className="size-4" />}>Submit week</Button>}
      title={`Submit ${label}?`}
      description={`${formatDuration(total)} goes to your manager for approval. You can't edit the week until it is approved or sent back.`}
      confirmLabel="Submit"
      tone="primary"
      onConfirm={() => submitWeek({ weekStart })}
    />
  )
}
