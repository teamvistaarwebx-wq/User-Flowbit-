'use client'

import { Check, CircleHelp, X } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { cn } from '@/lib/utils'
import { rsvpMeeting } from '@/modules/work/meetings/actions'

const OPTIONS = [
  { value: 'accepted', label: 'Accept', icon: Check, active: 'bg-[#08AD93] text-white' },
  { value: 'tentative', label: 'Maybe', icon: CircleHelp, active: 'bg-[#E4BD6D] text-[#3B2C0B]' },
  { value: 'declined', label: 'Decline', icon: X, active: 'bg-[#E9403B] text-white' },
] as const

/** Accept / Maybe / Decline for the signed-in attendee, as a segmented control whose chosen answer fills with its status colour. */
export function RsvpButtons({ meetingId, value, size = 'sm' }: { meetingId: string; value?: string; size?: 'sm' | 'md' }) {
  const [run, pending] = useAction(rsvpMeeting)
  return (
    <div className="relative z-10 inline-flex gap-0.5 rounded-full bg-control p-1" role="group" aria-label="Your RSVP">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={pending}
          aria-pressed={value === o.value}
          onClick={() => value !== o.value && run({ id: meetingId, rsvp: o.value })}
          className={cn(
            'press inline-flex items-center gap-1 rounded-full font-medium transition-colors duration-150 disabled:opacity-60',
            size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-8 px-3.5 text-[13px]',
            value === o.value ? o.active : 'text-white/75 hover:bg-white/[0.05] hover:text-white',
          )}
        >
          <o.icon className="size-3.5" />
          {o.label}
        </button>
      ))}
    </div>
  )
}
