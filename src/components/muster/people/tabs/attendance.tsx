import { CalendarCheck, CalendarDays, ListChecks } from 'lucide-react'
import { formatDate, monthOf, todayIST } from '@/lib/dates'
import { buildHref, first } from '@/lib/list'
import { StatusPill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { MonthCalendar, type DayMark } from '@/components/ui/month-calendar'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { getMonthRegister } from '@/modules/muster/attendance/queries'
import { CELL_META } from '@/modules/muster/attendance/register'
import { ListCard, ListRow, ListRows } from '../../ui/list-card'
import { MonthSwitcher } from '../../attendance/month-switcher'
import type { TabProps } from './types'

/** Attendance tab: the person's month (summary + calendar) and their corrections. */
export async function AttendanceTab({ ctx, employee: e, sp }: TabProps) {
  const raw = first(sp.month)
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : monthOf(todayIST())
  const [register, corrections] = await Promise.all([
    getMonthRegister(ctx, month, { employeeIds: [String(e._id)] }),
    ctx.db(AttendanceCorrection).find({ employeeId: e._id }).sort({ createdAt: -1 }).limit(10).lean(),
  ])
  const row = register.rows[0]
  const base = `/app/hr/people/${e._id}`
  const marks: Record<string, DayMark> = {}
  for (const c of row?.cells ?? []) {
    if (c.status === 'upcoming' || c.status === 'na') continue
    marks[c.date] = { tone: CELL_META[c.status].tone, label: `${CELL_META[c.status].label}${c.assumed ? ' (not marked)' : ''}${c.note ? ` · ${c.note}` : ''}` }
  }
  const s = row?.summary
  const tiles = s
    ? [
        { label: 'Working days', value: s.workingDays },
        { label: 'Payable so far', value: s.payableDays },
        { label: 'Loss of pay', value: s.lopDays, danger: s.lopDays > 0 },
        { label: 'Leave', value: s.leaveDays + s.unpaidLeaveDays },
        { label: 'Late', value: s.lateDays },
      ]
    : []
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card variant="solid" className="col-span-12 rounded-[10px] lg:col-span-7">
        <CardHeader
          label="Month"
          icon={<CalendarDays />}
          description={register.locked ? 'Locked for payroll' : undefined}
          actions={<MonthSwitcher month={month} basePath={base} params={{ ...sp, tab: 'attendance' }} />}
        />
        {row ? (
          <MonthCalendar month={month} marks={marks} size="lg" hideHeader />
        ) : (
          <p className="py-10 text-center text-sm text-fg-2">{e.firstName} was not employed in this month.</p>
        )}
      </Card>
      <div className="col-span-12 space-y-4 lg:col-span-5">
        <Card>
          <CardHeader label="Summary" icon={<CalendarCheck />} actions={<Button size="sm" variant="secondary" href={buildHref('/app/hr/attendance', {}, { month })}>Open register</Button>} />
          {tiles.length ? (
            <dl className="grid grid-cols-2 gap-x-6">
              {tiles.map((t) => (
                <div key={t.label} className="border-b border-white/[0.1] py-3">
                  <dt className="text-sm text-white/80">{t.label}</dt>
                  <dd className={t.danger ? 'mt-0.5 text-2xl font-semibold leading-[30px] tabular-nums text-[#FF6A66]' : 'mt-0.5 text-2xl font-semibold leading-[30px] tabular-nums text-white'}>{t.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-fg-2">No attendance this month.</p>
          )}
          {s?.assumedDays ? <p className="mt-3 text-xs text-fg-2">{s.assumedDays} days are not marked and follow the unmarked-day rule.</p> : null}
        </Card>
        <ListCard label="Corrections" icon={<ListChecks />} description="The last ten, newest first">
          {corrections.length ? (
            <ListRows>
              {corrections.map((c) => (
                <ListRow key={String(c._id)} className="flex-nowrap justify-between">
                  <span className="min-w-0 truncate text-white/85">{formatDate(c.date)} · {c.kind === 'override' ? 'HR set' : 'Asked for'} {CELL_META[c.requestedStatus as keyof typeof CELL_META]?.label ?? c.requestedStatus}</span>
                  <StatusPill status={c.status} />
                </ListRow>
              ))}
            </ListRows>
          ) : (
            <p className="px-5 py-6 text-sm text-fg-2 sm:px-[23px]">No corrections or overrides.</p>
          )}
        </ListCard>
      </div>
    </div>
  )
}
