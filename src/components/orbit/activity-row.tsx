'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { CalendarClock, Check, ExternalLink, Trash2, X } from 'lucide-react'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { IconButton } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Textarea } from '@/components/ui/input'
import { Popover } from '@/components/ui/popover'
import { cancelActivity, completeActivity, deleteActivity, rescheduleActivity } from '@/modules/orbit/activities.actions'
import { ACTIVITY_DONE_LABEL, ACTIVITY_LABEL, CHANNEL_LABEL } from '@/modules/orbit/constants'
import type { ActivityItem } from '@/modules/orbit/record-types'
import { ActivityTypeIcon } from './icons'
import { dueTone } from './parts'
import { dayDiff, dueLabel, istLocalInput, occurredBounds } from './time'

export type ActivityRowProps = { item: ActivityItem; today: string; canAct: boolean; canDelete?: boolean; showRelated?: boolean }

function DueChip({ dueDate, dueTime, today }: { dueDate: string; dueTime: string | null; today: string }) {
  const late = dayDiff(dueDate, today)
  return <span className={cn('whitespace-nowrap', dueTone(late), late >= 0 && 'font-medium')}>{late > 0 ? `${late}d late · ` : late === 0 ? 'Today · ' : ''}{dueLabel(dueDate, dueTime)}</span>
}

function CompleteDialog({ item }: { item: ActivityItem }) {
  const [open, setOpen] = useState(false)
  const bounds = occurredBounds()
  return (
    <Dialog open={open} onOpenChange={setOpen} title={`Complete: ${item.title || ACTIVITY_LABEL[item.type]}`} description="Mark it done and note what happened." size="md" trigger={<IconButton label="Mark done" size="sm"><Check className="size-4" /></IconButton>}>
      <ActionForm action={completeActivity} className="space-y-4" onDone={() => setOpen(false)}>
        <input type="hidden" name="id" value={item.id} />
        <FormField name="notes" label="Notes" required={item.type === 'meeting'}>
          <Textarea id="notes" name="notes" rows={4} defaultValue={item.notes} placeholder={item.type === 'meeting' ? 'Add what was discussed' : 'What happened'} maxLength={4000} />
        </FormField>
        <FormField name="occurredAt" label="When"><DateInput id="occurredAt" name="occurredAt" type="datetime-local" defaultValue={istLocalInput()} min={bounds.min} max={bounds.max} /></FormField>
        <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Mark done</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

function ReschedulePopover({ item, today }: { item: ActivityItem; today: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen} align="end" trigger={<IconButton label="Reschedule" size="sm"><CalendarClock className="size-4" /></IconButton>}>
      <ActionForm action={rescheduleActivity} className="w-64 space-y-3 p-1" onDone={() => setOpen(false)}>
        <input type="hidden" name="id" value={item.id} />
        <FormField name="dueDate" label="New date"><DateInput id={`due-${item.id}`} name="dueDate" min={today} defaultValue={item.dueDate ?? today} /></FormField>
        <FormField name="dueTime" label="Time"><DateInput id={`time-${item.id}`} name="dueTime" type="time" defaultValue={item.dueTime ?? ''} /></FormField>
        <SubmitButton size="sm" className="w-full" pendingLabel="Moving…">Move</SubmitButton>
      </ActionForm>
    </Popover>
  )
}

/** One activity: planned (with Complete / Reschedule / Cancel) or done/cancelled (read-only log). */
export function ActivityRow({ item, today, canAct, canDelete, showRelated = true }: ActivityRowProps) {
  const planned = item.status === 'planned'
  const cancelled = item.status === 'cancelled'
  // A cancelled activity never happened: name what was planned, not the "sent / held" past tense.
  const heading = planned || cancelled ? item.title || ACTIVITY_LABEL[item.type] : `${ACTIVITY_DONE_LABEL[item.type]}${item.channel !== 'other' ? ` · ${CHANNEL_LABEL[item.channel]}` : ''}`
  return (
    <li className="group flex items-start gap-3 rounded-[8px] px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
      <ActivityTypeIcon type={item.type} className="mt-px" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn('text-sm text-white', cancelled && 'text-fg-3 line-through decoration-white/30')}>{heading}</span>
          {showRelated && item.related ? (
            <Link href={item.related.href} className="inline-flex min-w-0 items-center gap-1 text-[13px] text-[#979797] transition-colors hover:text-white">
              <span className="capitalize">{item.related.kind}</span>
              <span aria-hidden>·</span>
              <span className="truncate">{item.related.label}</span>
            </Link>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#979797]">
          {planned && item.dueDate ? <DueChip dueDate={item.dueDate} dueTime={item.dueTime} today={today} /> : null}
          {cancelled && item.dueDate ? <span>Was due {dueLabel(item.dueDate, item.dueTime)}</span> : null}
          {!planned && !cancelled && item.occurredAt ? <span>{formatDateTime(item.occurredAt)}</span> : null}
          <span>· {planned || cancelled ? item.assigneeName : item.creatorName}</span>
          {item.meetingLink && planned ? (
            <a href={item.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link hover:text-white">Join <ExternalLink className="size-3" /></a>
          ) : null}
        </div>
        {item.notes && !planned ? <p className="mt-1.5 whitespace-pre-line text-[13px] leading-5 text-fg-2">{item.notes}</p> : null}
        {cancelled && item.cancelReason ? <p className="mt-1 text-xs text-fg-3">Cancelled: {item.cancelReason}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {planned && canAct ? (
          <>
            <CompleteDialog item={item} />
            <ReschedulePopover item={item} today={today} />
            <ConfirmDialog
              trigger={<IconButton label="Cancel" size="sm"><X className="size-4" /></IconButton>}
              title="Cancel this activity?"
              description="It stays in the history, struck through."
              confirmLabel="Cancel activity"
              cancelLabel="Keep it"
              reason={{ label: 'Reason (optional)', placeholder: 'They asked to reconnect next month' }}
              onConfirm={(reason) => cancelActivity({ id: item.id, reason })}
            />
          </>
        ) : null}
        {canDelete ? (
          <ConfirmDialog
            trigger={<IconButton label="Delete" size="sm" className="opacity-0 group-hover:opacity-100 touch:opacity-100 focus:opacity-100"><Trash2 className="size-4" /></IconButton>}
            title="Delete this activity?"
            description="Reports stop counting it. Stages it unlocked stay where they are."
            confirmLabel="Delete"
            onConfirm={() => deleteActivity({ id: item.id })}
          />
        ) : null}
      </div>
    </li>
  )
}

/** A list of activity rows with an empty state. */
export function ActivityList({ items, today, canAct, canDelete, showRelated, empty }: { items: ActivityItem[]; today: string; canAct: boolean; canDelete?: boolean; showRelated?: boolean; empty: ReactNode }) {
  if (!items.length) return <div className="px-3 py-8 text-center text-[13px] text-fg-2">{empty}</div>
  return (
    <ul className="space-y-px">
      {items.map((item) => <ActivityRow key={item.id} item={item} today={today} canAct={canAct} canDelete={canDelete} showRelated={showRelated} />)}
    </ul>
  )
}

