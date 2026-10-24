import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ClipboardList, Timer, TriangleAlert } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { DEFAULT_WORK_WEEK, addDays, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { buttonClass } from '@/components/ui/button-styles'
import { StatusPill } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { workdayMinutesOf } from '@/lib/attendance-core'
import { EntryList } from '@/components/work/time/entry-list'
import { LogTimeDialog } from '@/components/work/time/log-time-dialog'
import { SubmitWeekButton } from '@/components/work/time/submit-week'
import { TimerCard } from '@/components/work/time/timer-card'
import { WeekGrid } from '@/components/work/time/week-grid'
import { runningEntry, todayMinutes, weekData } from '@/modules/work/time/queries'
import { targetOptions } from '@/modules/work/time/targets'
import { expectedMinutes, isWeekEditable, normaliseWeek, weekDays, weekLabel } from '@/modules/work/time/week'

export const metadata: Metadata = { title: 'Time' }

const WEEK_NAV = 'press inline-flex h-6 items-center justify-center rounded-full px-2 text-white transition-colors duration-150 hover:bg-white/[0.06]'

export default async function TimePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'work', perm: 'time.write' })
  const today = todayIST()
  const weekStart = normaliseWeek(first(sp.week), today)
  const thisWeek = normaliseWeek(undefined, today)
  const [running, week, options, todayTotal] = await Promise.all([runningEntry(ctx), weekData(ctx, ctx.memberId, weekStart), targetOptions(ctx), todayMinutes(ctx)])
  const currentWeekSheet = weekStart === thisWeek ? week.sheet : (await weekData(ctx, ctx.memberId, thisWeek)).sheet
  const editable = isWeekEditable(week.sheet?.status)
  const workWeek = [...(ctx.org.workWeek?.length ? ctx.org.workWeek : DEFAULT_WORK_WEEK)]
  const label = weekLabel(weekStart)
  const status = week.sheet?.status ?? 'draft'

  return (
    <>
      <PageHeader
        title="Time"
        help="attendance-vs-time"
        description="What you worked on: track time with the timer or log it by hand, then submit your week. Attendance (check-in) is when you were at work; the two are kept separately."
        breadcrumb={breadcrumbFor('/app/work/time')}
        icon={<Timer />}
        actions={
          <>
            {ctx.can('time.approve') ? (
              <Link href="/app/work/time/approvals" className={buttonClass('secondary')}>
                <ClipboardList className="size-4" /> Approvals
              </Link>
            ) : null}
            {editable ? <LogTimeDialog options={options} today={today} /> : null}
          </>
        }
      />
      <div className="space-y-3">
        <TimerCard running={running} options={options} todayMinutes={todayTotal} locked={!isWeekEditable(currentWeekSheet?.status)} workdayMinutes={workdayMinutesOf(ctx.org.officeHours)} />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Week" className="flex h-[33px] items-center gap-0.5 rounded-full bg-control p-[4.5px]">
              <Link href={`/app/work/time?week=${addDays(weekStart, -7)}`} className={WEEK_NAV} aria-label="Previous week">
                <ChevronLeft className="size-4" />
              </Link>
              <h2 className="px-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{label}</h2>
              <Link href={`/app/work/time?week=${addDays(weekStart, 7)}`} className={WEEK_NAV} aria-label="Next week">
                <ChevronRight className="size-4" />
              </Link>
            </nav>
            {weekStart !== thisWeek ? (
              <Link href="/app/work/time" className={buttonClass('secondary', 'sm')}>
                This week
              </Link>
            ) : null}
            <StatusPill status={status} />
          </div>
          {editable && week.total > 0 ? <SubmitWeekButton weekStart={weekStart} label={label} total={week.total} /> : null}
        </div>

        {status === 'rejected' && week.sheet?.reason ? (
          <div role="status" className="card-solid flex items-start gap-3 rounded-[10px] px-4 py-3 text-sm text-white">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#FF4540]" />
            <span>
              Sent back: <span className="text-white/75">{week.sheet.reason}</span>. Fix the week and submit it again.
            </span>
          </div>
        ) : null}

        <WeekGrid days={weekDays(weekStart)} workWeek={workWeek} rows={week.rows} editable={editable} options={options} today={today} expected={expectedMinutes(weekStart, workWeek)} />
        <EntryList entries={week.entries} editable={editable} />
      </div>
    </>
  )
}
