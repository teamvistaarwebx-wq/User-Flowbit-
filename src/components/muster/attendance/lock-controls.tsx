'use client'

import { Lock, LockOpen } from 'lucide-react'
import { formatMonth } from '@/lib/dates'
import { ActionButton } from '@/components/muster/people/action-button'
import { lockAttendanceMonth, reopenAttendanceMonth } from '@/modules/muster/attendance/actions'

/** Lock (or reopen, with a reason) the month's attendance. */
export function LockControls({ month, locked, canLock, ended, pending = null }: { month: string; locked: boolean; canLock: boolean; ended: boolean; /** "2 leave requests and …" still waiting in the month. */ pending?: string | null }) {
  if (!canLock) return null
  if (locked) {
    return (
      <ActionButton
        action={reopenAttendanceMonth}
        input={{ month }}
        variant="secondary"
        size="md"
        icon={<LockOpen className="size-4" />}
        label="Reopen month"
        title={`Reopen ${formatMonth(month)}?`}
        description="Attendance becomes editable again. Regenerate that month's payroll once the corrections are in."
        confirmLabel="Reopen"
        tone="primary"
        reason={{ label: 'Why reopen it?', required: true, placeholder: 'Correction for Ravi on 14 Oct' }}
      />
    )
  }
  if (!ended) return null
  return (
    <ActionButton
      action={lockAttendanceMonth}
      input={{ month, lockAnyway: Boolean(pending) }}
      variant="primary"
      size="md"
      icon={<Lock className="size-4" />}
      label="Lock month"
      title={`Lock ${formatMonth(month)}?`}
      description={
        pending
          ? `${pending} for this month still wait for a decision. Once locked they can no longer be approved: decide them first, or lock anyway. Nobody can change this month's attendance until it is reopened.`
          : "Nobody can change this month's attendance (or check in for it) until it is reopened. Payroll can then be generated."
      }
      confirmLabel={pending ? 'Lock anyway' : 'Lock month'}
      tone="primary"
    />
  )
}
