import type { Metadata } from 'next'
import { productLabel } from '@/lib/catalog'
import { redirect } from 'next/navigation'
import { FileUp, Plus, Users } from 'lucide-react'
import { requireMember } from '@/lib/ctx'
import { formatDate, greeting, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { firstName } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { TrendCard } from '@/components/muster/attendance/trend-card'
import { ApprovalsCard, MovementsCard, OccasionsCard, TeamsCard, TodayCard } from '@/components/muster/dashboard/cards'
import { resolveRange } from '@/modules/muster/attendance/range'
import { attendanceTrend } from '@/modules/muster/attendance/trend'
import { hrDashboard } from '@/modules/muster/dashboard/queries'

export const metadata: Metadata = { title: 'Muster' }

export default async function HrDashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster' })
  if (!ctx.can('people.read')) redirect('/app/me')
  const range = resolveRange({ range: first(sp.range), from: first(sp.from), to: first(sp.to) }, todayIST())
  const [d, trend] = await Promise.all([hrDashboard(ctx), ctx.can('attendance.read') ? attendanceTrend(ctx, range) : Promise.resolve(null)])
  const waiting = d.approvals.leave + d.approvals.corrections + d.approvals.compOffs
  const inToday = d.tiles.in + d.tiles.remote + d.tiles.late + d.tiles.half

  return (
    <div className="@container">
      <header className="mb-[22px] flex flex-col gap-3 animate-slide-up sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-fg-2">{productLabel('muster')}</p>
          <h1 className="text-xl font-medium leading-6 text-white">
            {greeting()}, <span className="text-name">{firstName(ctx.user.name)}</span>
          </h1>
          <p className="mt-2 text-sm text-white">
            {formatDate(d.today, { withWeekday: true })}
            <span className="text-white/60"> · {d.headcount} {d.headcount === 1 ? 'person' : 'people'} on the board</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ctx.can('people.import') ? <Button variant="secondary" icon={<FileUp className="size-4" />} href="/app/settings/import/employees?from=people">Import</Button> : null}
          {ctx.can('people.write') ? <Button variant="primary" icon={<Plus className="size-4" />} href="/app/hr/people/new">Add employee</Button> : null}
        </div>
      </header>

      {d.headcount === 0 ? (
        <section className="card-solid rounded-[12px]">
          <EmptyState
            icon={<Users />}
            title="Add your first employee"
            description="People, attendance and leave all start from the employee records. Add them one by one or import a spreadsheet."
            action={ctx.can('people.write') ? <div className="flex gap-2"><Button variant="primary" href="/app/hr/people/new">Add employee</Button><Button variant="secondary" href="/app/settings/import/employees?from=people">Import CSV</Button></div> : undefined}
          />
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 @min-[900px]:grid-cols-4">
            <StatCard label="Headcount" value={d.headcount} color="var(--info)" hint={`${d.onProbation} on probation · ${d.onNotice} serving notice`} href="/app/hr/people" />
            <StatCard label="In today" value={inToday} color="var(--success)" hint={[d.tiles.remote ? `${d.tiles.remote} remote` : '', d.tiles.late ? `${d.tiles.late} late` : 'Nobody late'].filter(Boolean).join(' · ')} href={ctx.can('attendance.read') ? '/app/hr/attendance' : undefined} />
            <StatCard label="On leave today" value={d.tiles.leave} color="var(--violet)" hint={d.tiles.absent ? `${d.tiles.absent} absent` : 'No absences'} href={ctx.can('leave.read') ? '/app/hr/leave/calendar' : undefined} />
            <StatCard label="Approvals" value={waiting} color="var(--warning)" hint={d.approvals.leaveTotal ? `${d.approvals.leaveTotal} leave requests pending` : 'Nothing pending'} href={ctx.can('leave.read') ? '/app/hr/leave' : undefined} />
          </div>
          <div className="grid gap-3 @min-[1000px]:grid-cols-[743fr_532fr] @min-[1000px]:gap-[14.5px]">
            <TodayCard tiles={d.tiles} roll={d.roll} date={d.today} />
            <ApprovalsCard
              // Only queues this viewer can open (the counts use the same permissions).
              items={[
                ...(ctx.can('leave.read') ? [{ label: 'Leave requests', count: d.approvals.leave, href: '/app/hr/leave' }] : []),
                ...(ctx.can('attendance.approve')
                  ? [
                      { label: 'Attendance corrections', count: d.approvals.corrections, href: '/app/hr/attendance/corrections' },
                      { label: 'Comp-off claims', count: d.approvals.compOffs, href: '/app/hr/attendance/corrections?tab=compoff' },
                    ]
                  : []),
                ...(ctx.can('people.write') ? [{ label: 'People missing payroll details', count: d.missing, href: '/app/hr/people?filter=incomplete' }] : []),
              ]}
            />
          </div>
          {trend ? <TrendCard className="mt-2" trend={trend} basePath="/app/hr" params={sp} /> : null}
          <div className="mt-2 grid gap-3 @min-[1000px]:grid-cols-[543fr_732fr] @min-[1000px]:gap-[15px]">
            <TeamsCard data={d.deptCounts} headcount={d.headcount} />
            <OccasionsCard items={d.occasions} today={d.today} />
          </div>
          <MovementsCard items={d.movements} />
        </div>
      )}
    </div>
  )
}
