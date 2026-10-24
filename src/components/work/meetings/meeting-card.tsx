import Link from 'next/link'
import { MapPin, Video } from 'lucide-react'
import { AvatarStack } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { buttonClass } from '@/components/ui/button-styles'
import type { MeetingCardData } from '@/modules/work/meetings/queries'
import { rsvpSummary } from '@/modules/work/meetings/schedule'
import { RsvpButtons } from './rsvp-buttons'

/** Meeting row: date tile, time range, organiser, attendees, RSVP and Join. The next meeting gets the brighter lit hairline, not a glow. */
export function MeetingCard({ meeting, highlight }: { meeting: MeetingCardData; highlight?: boolean }) {
  const cancelled = meeting.status === 'cancelled'
  const past = new Date(meeting.endAt).getTime() < Date.now()
  const start = new Date(meeting.startAt)
  return (
    <article className={cn('glass lift relative flex flex-wrap items-center gap-4 rounded-[10px] p-4', highlight && 'lit-edge-bright bg-white/[0.08]')}>
      <div className="flex size-14 shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] bg-control">
        <span className="text-xl font-semibold leading-none tabular-nums text-white">{formatDate(start, { short: true }).split(' ')[0]}</span>
        <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.04em] text-fg-2">{formatDate(start, { short: true }).split(' ')[1]}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/app/work/meetings/${meeting.id}`} className={cn('truncate text-[15px] font-semibold text-white transition-colors after:absolute after:inset-0 after:rounded-[10px] after:content-[""] hover:text-blush', cancelled && 'text-fg-2 line-through decoration-white/30')}>
            {meeting.title}
          </Link>
          {highlight ? <Badge tone="violet">Next up</Badge> : null}
          {cancelled ? <Badge tone="danger">Cancelled</Badge> : null}
        </div>
        <p className="mt-1 text-[13px] tabular-nums text-[#959596]">
          {formatTime(meeting.startAt)} – {formatTime(meeting.endAt)} · by {meeting.organizer}
          {meeting.location ? (
            <span className="ml-2 inline-flex items-center gap-1">
              <MapPin className="size-3" /> {meeting.location}
            </span>
          ) : null}
        </p>
        <div className="mt-2 flex items-center gap-2 text-[13px] text-[#979797]">
          <AvatarStack people={meeting.attendees} max={4} size="xs" />
          {rsvpSummary(meeting.attendees)}
        </div>
      </div>
      <div className="relative z-10 flex flex-wrap items-center gap-2">
        {!cancelled && !past && meeting.myRsvp && !meeting.isOrganizer ? <RsvpButtons meetingId={meeting.id} value={meeting.myRsvp} /> : null}
        {!cancelled && !past && meeting.link ? (
          <a href={meeting.link} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'sm')}>
            <Video className="size-3.5" /> Join
          </a>
        ) : null}
      </div>
    </article>
  )
}
