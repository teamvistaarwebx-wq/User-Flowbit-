'use client'

import { Ban, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cancelMeeting } from '@/modules/work/meetings/actions'
import type { MeetingCalendar } from '@/modules/work/meetings/google-sync'
import type { PickPerson } from '../teams/people-picker'
import { MeetingFormDialog, type MeetingFormValues } from './meeting-form-dialog'

type Props = { meeting: MeetingFormValues; people: PickPerson[]; organizerId: string; today: string; calendar: MeetingCalendar; editOpen?: boolean }

export function MeetingActions({ meeting, people, organizerId, today, calendar, editOpen }: Props) {
  return (
    <>
      <MeetingFormDialog
        trigger={<Button variant="outline" icon={<Pencil className="size-4" />}>Edit</Button>}
        people={people}
        organizerId={organizerId}
        today={today}
        meeting={meeting}
        calendar={calendar}
        returnTo={`/app/work/meetings/${meeting.id}?edit=1`}
        defaultOpen={editOpen}
      />
      <ConfirmDialog
        trigger={<Button variant="ghost" icon={<Ban className="size-4" />}>Cancel meeting</Button>}
        title={`Cancel '${meeting.title}'?`}
        description="Attendees will be notified. The meeting stays in the list, struck through."
        confirmLabel="Cancel meeting"
        cancelLabel="Keep it"
        onConfirm={() => cancelMeeting({ id: meeting.id })}
      />
    </>
  )
}
