'use client'

import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { buttonClass } from '@/components/ui/button-styles'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/settings/surface'
import { createMeeting, updateMeeting } from '@/modules/work/meetings/actions'
import type { MeetingCalendar } from '@/modules/work/meetings/google-sync'
import { PeoplePicker, type PickPerson } from '../teams/people-picker'

export type MeetingFormValues = { id: string; title: string; agenda: string; date: string; start: string; end: string; location: string; link: string; attendeeIds: string[] }

type Props = {
  trigger: ReactNode
  people: PickPerson[]
  organizerId: string
  today: string
  meeting?: MeetingFormValues
  /** The organiser's Google Calendar: whether an empty link becomes a Meet link on save. */
  calendar: MeetingCalendar
  /** In-app path that reopens this form, where Connect returns after Google's consent screen. */
  returnTo: string
  defaultOpen?: boolean
}

const LINK_HELP = 'Google Meet, Zoom or Teams link'

/**
 * Above the form: how to get a Meet link when the calendar is not connected (Connect for the organiser, a note
 * for anyone else editing). Shown first so the person connects before typing; the form is lost on the way to Google.
 */
function CalendarNotice({ calendar, returnTo }: { calendar: MeetingCalendar; returnTo: string }) {
  if (calendar.status === 'off' || calendar.status === 'connected') return null
  const broken = calendar.status === 'broken'
  if (!calendar.mine) {
    return (
      <Notice className="sm:col-span-3">
        Meet links come from {calendar.ownerName}&apos;s Google Calendar, which {broken ? 'needs reconnecting' : 'is not connected'}. Paste a Meet, Zoom or Teams link instead.
      </Notice>
    )
  }
  const href = `/api/integrations/google/start?service=calendar&next=${encodeURIComponent(returnTo)}`
  return (
    // A plain link, not a prefetching <Link>: the start route sets the OAuth state cookie and leaves for Google.
    <Notice tone={broken ? 'warning' : 'info'} className="sm:col-span-3" action={<a href={href} className={buttonClass('primary', 'sm')}>{broken ? 'Reconnect' : 'Connect Google Calendar'}</a>}>
      {broken ? 'Your Google Calendar connection stopped working, so no Meet link will be created. Reconnect it, or paste a link.' : 'Connect Google Calendar to create a Google Meet link automatically, or paste a Meet, Zoom or Teams link below.'}
    </Notice>
  )
}

/** Schedule or edit a meeting: time in IST, attendees from members, agenda, link or location. */
export function MeetingFormDialog({ trigger, people, organizerId, today, meeting, calendar, returnTo, defaultOpen }: Props) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const [attendees, setAttendees] = useState<string[]>(meeting?.attendeeIds ?? [organizerId])
  const autoMeet = calendar.status === 'connected'
  const linkHelp = autoMeet ? `Leave empty and a Google Meet link is created on ${calendar.mine ? 'your' : `${calendar.ownerName}'s`} Google Calendar when you save. Or paste a Zoom or Teams link.` : LINK_HELP
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} size="lg" title={meeting ? 'Edit meeting' : 'Schedule meeting'} description="Times are in India Standard Time.">
      <ActionForm action={meeting ? updateMeeting : createMeeting} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-3">
        <CalendarNotice calendar={calendar} returnTo={returnTo} />
        {meeting ? <input type="hidden" name="id" value={meeting.id} /> : null}
        <FormField name="title" label="Title" required className="sm:col-span-3">
          <Input id="title" name="title" defaultValue={meeting?.title} maxLength={150} placeholder="Sprint review" />
        </FormField>
        <FormField name="date" label="Date" required>
          <DateInput id="date" name="date" defaultValue={meeting?.date ?? today} min={meeting ? undefined : today} />
        </FormField>
        <FormField name="start" label="Start" required>
          <DateInput type="time" id="start" name="start" defaultValue={meeting?.start ?? '11:00'} />
        </FormField>
        <FormField name="end" label="End" required>
          <DateInput type="time" id="end" name="end" defaultValue={meeting?.end ?? '11:30'} />
        </FormField>
        <FormField name="attendeeIds" label="Attendees" required className="sm:col-span-3">
          <PeoplePicker name="attendeeIds" people={people} value={attendees} onChange={setAttendees} locked={[organizerId]} placeholder="Invite people" />
        </FormField>
        <FormField name="link" label="Meeting link" className="sm:col-span-2" help={linkHelp}>
          <Input id="link" name="link" type="url" defaultValue={meeting?.link} placeholder={autoMeet ? 'Leave empty for a Google Meet link' : 'https://meet.google.com/…'} />
        </FormField>
        <FormField name="location" label="Location">
          <Input id="location" name="location" defaultValue={meeting?.location} maxLength={200} placeholder="Board room" />
        </FormField>
        <FormField name="agenda" label="Agenda" className="sm:col-span-3">
          <Textarea id="agenda" name="agenda" rows={4} maxLength={5000} defaultValue={meeting?.agenda} placeholder="What will you cover?" />
        </FormField>
        <div className="flex justify-end sm:col-span-3">
          <SubmitButton>{meeting ? 'Save changes' : 'Schedule'}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
