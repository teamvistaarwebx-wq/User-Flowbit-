'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { ChipGroup } from '@/components/ui/chip-group'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { scheduleActivity } from '@/modules/orbit/activities.actions'
import { ACTIVITY_LABEL, PLANNABLE_TYPES, type PlannableType } from '@/modules/orbit/constants'
import type { Option, RecordHit, RecordKind } from '@/modules/orbit/record-types'
import type { RelatedRef } from './log-activity-dialog'
import { RecordFields, RecordPicker } from './record-picker'

export type ScheduleDialogProps = {
  trigger: ReactNode
  related?: RelatedRef
  pickKinds?: RecordKind[]
  /** Assignee options (only reviewers may pick someone else). */
  assignees?: Option[]
  defaultAssigneeId?: string
  defaultTitle?: string
  today: string
}

/** Schedule a follow-up, call, email, DM or meeting with a due date. */
export function ScheduleDialog({ trigger, related, pickKinds = ['lead', 'deal', 'client'], assignees, defaultAssigneeId, defaultTitle = '', today }: ScheduleDialogProps) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<PlannableType>('follow_up')
  const [hit, setHit] = useState<RecordHit | null>(null)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} title="Schedule follow-up" description="Every open lead needs a next step with a date." size="md">
      <ActionForm action={scheduleActivity} className="space-y-4" onDone={() => { setOpen(false); setHit(null) }}>
        {related ? Object.entries(related).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null)) : null}
        {!related ? (
          <FormField name="leadId" label="Related to" required>
            <RecordPicker kinds={pickKinds} value={hit} onChange={setHit} />
            <RecordFields hit={hit} />
          </FormField>
        ) : null}
        <FormField name="type" label="Type" required>
          <ChipGroup name="type" value={type} onValueChange={(v) => setType(v as PlannableType)} options={PLANNABLE_TYPES.map((t) => ({ value: t, label: ACTIVITY_LABEL[t] }))} size="sm" />
        </FormField>
        <FormField name="title" label="Title" required>
          <Input id="title" name="title" defaultValue={defaultTitle} placeholder={type === 'meeting' ? 'Discovery call' : 'Send the proposal deck'} maxLength={140} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="dueDate" label="Date" required><DateInput id="dueDate" name="dueDate" min={today} defaultValue={today} /></FormField>
          <FormField name="dueTime" label="Time"><DateInput id="dueTime" name="dueTime" type="time" /></FormField>
        </div>
        {assignees && assignees.length ? (
          <FormField name="assigneeId" label="Assignee"><Select id="assigneeId" name="assigneeId" defaultValue={defaultAssigneeId} options={assignees} placeholder="Record owner" /></FormField>
        ) : null}
        {type === 'meeting' ? (
          <FormField name="meetingLink" label="Meeting link"><Input id="meetingLink" name="meetingLink" placeholder="https://meet.google.com/…" /></FormField>
        ) : null}
        <FormField name="notes" label="Notes"><Textarea id="notes" name="notes" rows={2} maxLength={4000} /></FormField>
        <div className="flex justify-end"><SubmitButton pendingLabel="Scheduling…">Schedule</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}
