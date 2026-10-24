import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlignLeft, CalendarDays, ChartNoAxesColumn, ListChecks, SquareCheckBig, UserRound } from 'lucide-react'
import { addDays, formatDate } from '@/lib/dates'
import { buildHref, type SearchParams } from '@/lib/list'
import { cn } from '@/lib/utils'
import { AvatarStack } from '@/components/ui/avatar'
import { PriorityLabel } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { HomeTab } from '@/modules/work/dashboard/queries'
import { onLeaveOn } from '@/modules/work/presence-core'
import type { Person, TaskRow } from '../tasks/types'
import { AssignedPendingList, AssignedPendingRows, AssignedQuickAddInput, AssignedQuickAddProvider } from './assigned-quick-add'
import { TaskOrder } from '../tasks/panel/task-order'
import { QuickComplete } from './quick-complete'
import { SegmentedLinks } from './segmented-links'

const EMPTY: Record<HomeTab, string> = { all: 'Nothing assigned to you', done: 'No tasks done in the last 30 days', due: 'Nothing due today' }
const SUBTITLE: Record<HomeTab, string> = { all: 'Showing all tasks assigned to me', done: 'Showing what I finished in the last 30 days', due: 'Showing what is due today or overdue' }
const VIEW_ALL: Record<HomeTab, string> = { all: '/app/work/tasks?view=list&mine=1', done: '/app/work/tasks?view=list&mine=1&status=done', due: '/app/work/tasks?view=list&mine=1&due=today' }

/** Figma due column: "Today" in red, "Tomorrow", otherwise "25 Jul" in grey; overdue reads red with its date. */
function Due({ dueDate, today, done }: { dueDate: string | null; today: string; done: boolean }) {
  if (!dueDate) return <span className="text-[13px] text-[#979797]">No date</span>
  const late = !done && dueDate < today
  const label = dueDate === today ? 'Today' : dueDate === addDays(today, 1) ? 'Tomorrow' : formatDate(dueDate, { short: true })
  return (
    <span title={formatDate(dueDate)} className={cn('whitespace-nowrap text-[13px]', !done && (dueDate === today || late) ? 'text-[#FF2D31]' : 'text-[#979797]')}>
      {late ? `${label}, late` : label}
    </span>
  )
}

function Th({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn('h-[33px] whitespace-nowrap px-0 text-left text-[13px] font-normal text-white', className)}>
      <span className="inline-flex items-center gap-1.5 [&_svg]:size-[15px] [&_svg]:shrink-0">
        {icon}
        {children}
      </span>
    </th>
  )
}

/** "Assign to me" (Figma): opaque card, segmented All task / Done / Due, a ruled header row, 32px rows. */
/** `quickAdd`: an inline "type a title, press Enter" row on the All tab, creating a task assigned to me (`personal` in personal mode). */
export function AssignedTable({ tab, rows, counts, people, today, sp, newTask, quickAdd }: { tab: HomeTab; rows: TaskRow[]; counts: Record<HomeTab, number>; people: Person[]; today: string; sp: SearchParams; newTask?: ReactNode; quickAdd?: { personal: boolean } }) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const tabHref = (t: HomeTab) => buildHref('/app', sp, { tab: t === 'all' ? undefined : t })
  const canQuickAdd = Boolean(quickAdd) && tab === 'all'
  const card = (
    <section aria-label="Assigned to me" className="card-table flex h-full min-h-[375px] flex-col">
      <TaskOrder ids={rows.map((r) => r.id)} />
      <header className="flex items-start justify-between gap-3 px-[23px] pb-4 pt-[17px]">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white">
            <ListChecks className="size-4" strokeWidth={1.5} />
            Assign to me
          </h2>
          <p className="mt-1 text-[13px] text-[#959596]">{SUBTITLE[tab]}</p>
        </div>
        <SegmentedLinks
          label="Filter tasks"
          className="-mr-[14px] shrink-0"
          items={[
            { href: tabHref('all'), label: 'All task', active: tab === 'all', title: `${counts.all} tasks` },
            { href: tabHref('done'), label: 'Done', active: tab === 'done', title: `${counts.done} done` },
            { href: tabHref('due'), label: 'Due', active: tab === 'due', title: `${counts.due} due` },
          ]}
        />
      </header>
      {canQuickAdd ? <AssignedQuickAddInput /> : null}
      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center border-t border-line pt-2">
          {canQuickAdd ? <AssignedPendingList /> : null}
          <EmptyState compact icon={<SquareCheckBig />} title={EMPTY[tab]} description={tab === 'all' ? 'New work assigned to you shows up here.' : undefined} action={tab === 'all' ? newTask : undefined} />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[23px]" />
              <col />
              <col className="w-[18%]" />
              <col className="w-[17%]" />
              <col className="w-[13%]" />
              <col className="w-[23px]" />
            </colgroup>
            <thead>
              <tr className="border-y border-line">
                <th aria-hidden />
                <Th icon={<AlignLeft strokeWidth={1.5} />}>Task Name</Th>
                <Th icon={<ChartNoAxesColumn strokeWidth={1.5} />}>Priority</Th>
                <Th icon={<CalendarDays strokeWidth={1.5} />}>Due</Th>
                <Th icon={<UserRound strokeWidth={1.5} />}>Assignee</Th>
                <th aria-hidden />
              </tr>
            </thead>
            {canQuickAdd ? <AssignedPendingRows /> : null}
            <tbody>
              <tr aria-hidden className="h-2.5" />
              {rows.map((t) => (
                <tr key={t.id} className="group h-8 transition-colors hover:bg-white/[0.04]">
                  <td />
                  <td className="pr-4">
                    <div className="flex items-center gap-[11px]">
                      <QuickComplete id={t.id} title={t.title} status={t.status} disabled={!t.canEdit} />
                      <Link href={`/app/work/tasks/${t.id}`} scroll={false} className={cn('truncate text-[13px] transition-colors', t.status === 'done' ? 'text-fg-2 line-through decoration-white/30' : 'text-white hover:text-blush')}>
                        {t.title}
                      </Link>
                    </div>
                  </td>
                  <td>
                    <PriorityLabel priority={t.priority} />
                  </td>
                  <td>
                    <Due dueDate={t.dueDate} today={today} done={t.status === 'done'} />
                  </td>
                  <td>
                    <AvatarStack size="xs" max={3} people={t.assigneeIds.map((id) => ({ name: byId.get(id)?.name, src: byId.get(id)?.avatarUrl, away: onLeaveOn(byId.get(id)?.leaveDates, today) }))} />
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length ? (
        <div className="flex justify-end px-[23px] pb-4 pt-2">
          <Link href={VIEW_ALL[tab]} className="text-[13px] text-fg-2 transition-colors hover:text-white">
            View all tasks
          </Link>
        </div>
      ) : null}
    </section>
  )
  return canQuickAdd && quickAdd ? (
    <AssignedQuickAddProvider serverIds={rows.map((r) => r.id)} personal={quickAdd.personal}>
      {card}
    </AssignedQuickAddProvider>
  ) : (
    card
  )
}
