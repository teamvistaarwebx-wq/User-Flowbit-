import Link from 'next/link'
import { GitCommitHorizontal, History, ScrollText } from 'lucide-react'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { ActivityList } from '@/components/orbit/activity-row'
import { TableCard } from '@/components/orbit/parts'
import type { ClientEvent } from '@/modules/clients/detail'
import type { ActivityItem } from '@/modules/orbit/record-types'

export function ActivityTab({ activities, events, today, showOrbit }: { activities: ActivityItem[]; events: ClientEvent[]; today: string; showOrbit: boolean }) {
  return (
    <div className={cn('grid gap-3 xl:gap-[15px]', showOrbit && 'xl:grid-cols-[732fr_543fr]')}>
      {showOrbit ? (
        <TableCard icon={<History />} title="Logged activity" subtitle="Calls, emails, meetings and notes across this client's leads and deals">
          <div className="border-t border-line px-[11px] py-2">
            <ActivityList items={activities} today={today} canAct={false} showRelated empty="No activity yet." />
          </div>
        </TableCard>
      ) : null}
      <TableCard icon={<ScrollText />} title="Changes" subtitle="Record changes and stage moves">
        <div className="border-t border-line px-[11px] py-2">
          {events.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-fg-2">No changes yet.</p>
          ) : (
            <ul className="space-y-px">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 rounded-[8px] px-3 py-2.5">
                  <span aria-hidden className="mt-px flex h-5 w-5 shrink-0 items-center justify-center text-icon-muted">{e.kind === 'stage' ? <GitCommitHorizontal className="size-4" /> : <ScrollText className="size-4" />}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-white">{e.href ? <Link href={e.href} className="transition-colors hover:text-blush">{e.title}</Link> : e.title}</p>
                    <p className="mt-0.5 text-xs text-[#979797]">{formatDateTime(e.at)} · {e.who}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </TableCard>
    </div>
  )
}
