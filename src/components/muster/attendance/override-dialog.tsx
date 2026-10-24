'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { ChipGroup } from '@/components/ui/chip-group'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { useAction } from '@/components/ui/action-form'
import { clearAttendanceOverride, overrideAttendanceDay } from '@/modules/muster/attendance/actions'
import { CELL_META, OVERRIDE_STATUSES, type Cell, type OverrideStatus } from '@/modules/muster/attendance/register'

/** Set one person's day to a status, with a reason (audited). Can also remove an earlier override. */
export function OverrideDialog({ row, cell, onClose }: { row: { employeeId: string; name: string }; cell: Cell; onClose: () => void }) {
  const initial = (OVERRIDE_STATUSES as readonly string[]).includes(cell.status) ? (cell.status as OverrideStatus) : 'present'
  const [status, setStatus] = useState<OverrideStatus>(initial)
  const [reason, setReason] = useState('')
  const [save, saving] = useAction(overrideAttendanceDay, { onDone: onClose })
  const [clear, clearing] = useAction(clearAttendanceOverride, { onDone: onClose })
  const current = CELL_META[cell.status]
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={`${row.name} · ${formatDate(cell.date, { withWeekday: true })}`}
      description={`Now ${current.label.toLowerCase()}${cell.assumed ? ' (assumed, not marked)' : ''}${cell.source === 'punch' ? ' from check-in' : cell.source === 'leave' ? ' from approved leave' : cell.source === 'override' ? ' set by HR' : ''}${cell.note ? `: ${cell.note}` : ''}.`}
      footer={
        <>
          {cell.source === 'override' ? <Button variant="ghost" loading={clearing} onClick={() => clear({ employeeId: row.employeeId, date: cell.date })}>Remove override</Button> : null}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!reason.trim()} onClick={() => save({ employeeId: row.employeeId, date: cell.date, status, reason: reason.trim() })}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-white">Mark the day as</p>
          <ChipGroup value={status} onValueChange={(v) => setStatus(v as OverrideStatus)} options={OVERRIDE_STATUSES.map((s) => ({ value: s, label: CELL_META[s].label }))} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-white">Reason <span className="text-[#F64A45]">*</span></span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={280} placeholder="Forgot to check in; was at the client site" />
        </label>
      </div>
    </Dialog>
  )
}
