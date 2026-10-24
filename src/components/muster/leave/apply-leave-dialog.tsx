'use client'

import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { FileUpload } from '@/components/ui/file-upload'
import { DateInput, NativeSelect, Textarea } from '@/components/ui/input'
import { applyForLeave } from '@/modules/muster/leave/actions'
import { LeavePreview } from './leave-preview'

type TypeOption = { value: string; label: string; allowHalfDay: boolean }

/** Apply for leave on someone's behalf (or pick the person). The server works out paid and unpaid days. */
export function ApplyLeaveDialog({ types, employees, fixedEmployee, today, label = 'Apply on behalf', variant = 'primary' }: { types: TypeOption[]; employees: { value: string; label: string }[]; fixedEmployee?: string; today: string; label?: string; variant?: 'primary' | 'violet' }) {
  const [open, setOpen] = useState(false)
  const [typeId, setTypeId] = useState(types[0]?.value ?? '')
  const [start, setStart] = useState(today)
  const [halfDay, setHalfDay] = useState(false)
  const [end, setEnd] = useState(today)
  const [who, setWho] = useState(fixedEmployee ?? '')
  const type = types.find((t) => t.value === typeId)
  return (
    <Dialog open={open} onOpenChange={setOpen} size="lg" trigger={<Button variant={variant} size="sm" icon={<CalendarPlus className="size-4" />}>{label}</Button>} title="Apply for leave" description="Weekly offs and holidays are skipped. Days the balance does not cover become loss of pay.">
      <ActionForm action={applyForLeave} onDone={() => setOpen(false)} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
        {fixedEmployee ? (
          <input type="hidden" name="employeeId" value={fixedEmployee} />
        ) : (
          <FormField name="employeeId" label="Employee" required className="sm:col-span-2">
            <NativeSelect id="employeeId" name="employeeId" options={employees} placeholder="Choose a person" value={who} onChange={(e) => setWho(e.target.value)} />
          </FormField>
        )}
        <FormField name="leaveTypeId" label="Leave type" required className="sm:col-span-2">
          <NativeSelect id="leaveTypeId" name="leaveTypeId" options={types} value={typeId} onChange={(e) => { setTypeId(e.target.value); setHalfDay(false) }} />
        </FormField>
        <FormField name="startDate" label="From" required><DateInput id="startDate" name="startDate" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
        <FormField name="endDate" label="To" required><DateInput id="endDate" name="endDate" key={halfDay ? `half-${start}` : 'range'} defaultValue={start} min={start} readOnly={halfDay} onChange={(e) => setEnd(e.target.value)} /></FormField>
        {type?.allowHalfDay ? (
          <FormField name="isHalfDay" className="sm:col-span-2"><Checkbox name="isHalfDay" checked={halfDay} onCheckedChange={(v) => setHalfDay(Boolean(v))} label="Half day" description="Starts and ends on the same date" /></FormField>
        ) : null}
        {halfDay ? (
          <FormField name="halfDaySession" label="Which half" className="sm:col-span-2">
            <NativeSelect id="halfDaySession" name="halfDaySession" options={[{ value: 'first', label: 'First half (morning)' }, { value: 'second', label: 'Second half (afternoon)' }]} defaultValue="first" />
          </FormField>
        ) : null}
        {who ? <LeavePreview employeeId={who} leaveTypeId={typeId} startDate={start} endDate={halfDay ? start : end} isHalfDay={halfDay} /> : null}
        <FormField name="reason" label="Reason" required className="sm:col-span-2"><Textarea id="reason" name="reason" rows={3} placeholder="Tell the manager why" /></FormField>
        <FormField name="attachment" label="Supporting document" help="Needed for some leave types (medical certificate, proof)." className="sm:col-span-2">
          <FileUpload name="attachment" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" />
        </FormField>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <SubmitButton pendingLabel="Sending…">Send for approval</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
