'use client'

import { useEffect, useState } from 'react'
import { previewLeave } from '@/modules/muster/leave/actions'

/**
 * Paid days vs loss of pay for the request being filled in, before it is sent (R1 2.11).
 * Quiet while the form is incomplete; shows the server's refusal (e.g. a range of only holidays) as plain text.
 */
export function LeavePreview({ employeeId, leaveTypeId, startDate, endDate, isHalfDay }: { employeeId?: string; leaveTypeId: string; startDate: string; endDate: string; isHalfDay: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const ready = Boolean(leaveTypeId && startDate && endDate && endDate >= startDate)
  useEffect(() => {
    if (!ready) return
    let live = true
    const id = setTimeout(() => {
      previewLeave({ ...(employeeId ? { employeeId } : {}), leaveTypeId, startDate, endDate: isHalfDay ? startDate : endDate, isHalfDay })
        .then((r) => live && setText(r.ok ? (r.message ?? null) : r.error))
        .catch(() => live && setText(null))
    }, 300)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [ready, employeeId, leaveTypeId, startDate, endDate, isHalfDay])
  if (!ready || !text) return null
  return <p className="text-xs text-fg-2 sm:col-span-2" aria-live="polite">{text}</p>
}
