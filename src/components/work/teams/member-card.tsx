'use client'

import { Crown } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { LoadBar } from './workload-view'
import { PRESENCE_TONE, ProjectLogos } from './member-bits'
import type { TeamMember } from './members-table'
import { LocalTime } from './local-time'

const SHOWN_SKILLS = 4

/**
 * A member card: avatar with today's presence dot, role and team, local time and skills, this week's load and project logos.
 * Hover lights a slow gradient hairline (still under reduced motion).
 */
export function MemberCard({ member, teamName, actions, highlight }: { member: TeamMember; teamName: string; actions?: React.ReactNode; highlight?: string }) {
  return (
    <li className="group rounded-[14px] bg-white/[0.08] bg-[length:200%_200%] p-px transition-colors duration-300 hover:bg-[image:var(--grad-stroke-brand)] focus-within:bg-[image:var(--grad-stroke-brand)] motion-safe:hover:animate-gradient">
      <div className="flex h-full flex-col gap-3 rounded-[13px] bg-[#1d1d1f] p-4 transition-colors group-hover:bg-[#202022]">
        <div className="flex items-start gap-3">
          <Avatar name={member.name} src={member.avatarUrl} size="md" marker={member.presence.state} markerLabel={member.presenceText} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{member.name}</p>
            <p className="truncate text-[13px] text-[#959596]">{member.title || 'No title'}{member.department ? ` · ${member.department}` : ''}</p>
            <p className={cn('mt-0.5 truncate text-xs', PRESENCE_TONE[member.presence.state])}>{member.presenceText}</p>
          </div>
          <Badge tone={member.role === 'lead' ? 'violet' : 'neutral'} icon={member.role === 'lead' ? <Crown className="size-3" /> : undefined}>
            {member.role === 'lead' ? 'Lead' : 'Member'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <LocalTime zone={member.timezone} className="mr-1 text-xs text-[#979797]" />
          {member.skills.slice(0, SHOWN_SKILLS).map((s) => (
            <span key={s} className={cn('rounded-full border px-2 py-0.5 text-[11px]', highlight && s.toLowerCase().includes(highlight) ? 'border-white/40 bg-white/[0.1] text-white' : 'border-white/[0.1] text-white/75')}>{s}</span>
          ))}
          {member.skills.length > SHOWN_SKILLS ? <span className="text-[11px] text-[#979797]" title={member.skills.slice(SHOWN_SKILLS).join(', ')}>+{member.skills.length - SHOWN_SKILLS}</span> : null}
        </div>
        <LoadBar logged={member.load} planned={member.planned} label="this week" className="min-w-0" />
        <div className="flex items-center justify-between gap-2">
          <ProjectLogos projects={member.projects} />
          <span className="truncate text-xs text-[#979797]">{member.open} open{member.overdue ? ` · ${member.overdue} late` : ''} · {teamName}</span>
        </div>
        {actions ? <div className="-mb-1 flex justify-end gap-1 border-t border-line pt-2">{actions}</div> : null}
      </div>
    </li>
  )
}
