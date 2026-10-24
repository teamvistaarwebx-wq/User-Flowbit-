import Link from 'next/link'
import { Crown, ListTodo } from 'lucide-react'
import { AvatarStack } from '@/components/ui/avatar'
import { pluralize } from '@/lib/utils'
import type { TeamCardData } from '@/modules/work/teams/queries'
import { TeamCardActions } from './team-card-actions'

/** A team as a small glass card (radius 10): initials square, name and description, lead, people and open tasks. */
export function TeamCard({ team, myMemberId, canManage }: { team: TeamCardData; myMemberId: string; canManage: boolean }) {
  return (
    <article className="glass lift relative flex flex-col gap-4 rounded-[10px] p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]" style={{ background: `color-mix(in srgb, ${team.color} 62%, #1A1A1A)` }}>
          {team.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/app/work/teams/${team.id}`} className="block truncate text-[15px] font-semibold leading-5 text-white transition-colors after:absolute after:inset-0 after:rounded-[10px] after:content-[''] hover:text-blush">
            {team.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-[#959596]">{team.description || 'No description'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[13px] text-white">
        <Crown className="size-4 text-icon-muted" />
        {team.lead ? team.lead.name : <span className="text-fg-2">No team lead</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {team.people.length ? <AvatarStack people={team.people} max={4} size="xs" /> : null}
        <span className="text-[13px] text-[#979797]">{pluralize(team.people.length, 'member')}</span>
        <span className="inline-flex items-center gap-1 text-[13px] tabular-nums text-[#979797]">
          <ListTodo className="size-3.5" /> {team.openTasks} open
        </span>
      </div>
      {/* Actions on their own ruled row, so every card in the grid lines up whatever the description length. */}
      <div className="mt-auto border-t border-white/[0.08] pt-3">
        <TeamCardActions team={{ id: team.id, name: team.name, description: team.description ?? '', color: team.color, isPrivate: team.isPrivate, memberCount: team.people.length }} isMember={team.isMember} myMemberId={myMemberId} canManage={canManage} />
      </div>
    </article>
  )
}
