import { CalendarHeart, Plane } from 'lucide-react'
import { todayIST } from '@/lib/dates'
import { StatusPill } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { getLeaveBalances } from '@/modules/muster/leave/balances'
import { daysLabel, leaveSpanLabel } from '@/modules/muster/leave/days'
import { leaveTypeOptions } from '@/modules/muster/leave/queries'
import { isInDirectory } from '@/modules/muster/people/lifecycle'
import { ListCard, ListRow, ListRows } from '../../ui/list-card'
import { ApplyLeaveDialog } from '../../leave/apply-leave-dialog'
import type { TabProps } from './types'

/** Leave tab: balances for the current leave year and the person's requests. */
export async function LeaveTab({ ctx, employee: e }: TabProps) {
  const today = todayIST()
  const [{ year, rows }, requests, types] = await Promise.all([
    getLeaveBalances(ctx, e, today),
    ctx.db(LeaveRequest).find({ employeeId: e._id }).sort({ startDate: -1 }).limit(20).lean(),
    leaveTypeOptions(ctx),
  ])
  const canApply = ctx.can('leave.manage') && isInDirectory(e.status)
  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 lg:col-span-5">
        <CardHeader label={`Balances · ${year.label}`} icon={<CalendarHeart />} description={rows[0]?.accrues === false ? 'Does not accrue on this engagement (probation, intern or contract).' : undefined} />
        <ul>
          {rows.map((r) => (
            <li key={r.typeId} className="flex items-center justify-between gap-3 border-b border-white/[0.1] py-3 last:border-0">
              <span className="min-w-0">
                <span className="block text-sm text-white">{r.name}</span>
                <span className="block text-xs text-fg-2">
                  {r.remaining === null ? `Up to ${r.perRequestCap} days per request` : `${r.opening ? `${r.opening} carried · ` : ''}${r.accrued} earned · ${r.taken} taken${r.adjusted ? ` · ${r.adjusted > 0 ? '+' : ''}${r.adjusted} adjusted` : ''}${r.pending ? ` · ${r.pending} pending` : ''}`}
                </span>
              </span>
              <span className="text-2xl font-semibold leading-[30px] tabular-nums text-white">{r.remaining ?? '—'}</span>
            </li>
          ))}
          {!rows.length ? <li className="text-sm text-fg-2">No paid leave types. Add them in HR settings.</li> : null}
        </ul>
      </Card>
      <ListCard className="col-span-12 lg:col-span-7" label="Requests" icon={<Plane />} description="The last twenty, newest first" actions={canApply ? <ApplyLeaveDialog types={types} employees={[{ value: String(e._id), label: e.fullName }]} fixedEmployee={String(e._id)} today={today} variant="violet" /> : null}>
        {requests.length ? (
          <ListRows>
            {requests.map((r) => (
              <ListRow key={String(r._id)}>
                <span className="min-w-0 flex-1">
                  <span className="block text-white">{r.leaveName} · {daysLabel(r.dayCount)}{r.unpaidDays ? <span className="text-[#FF6A66]"> ({r.unpaidDays} unpaid)</span> : null}</span>
                  <span className="block truncate text-xs text-fg-2">{leaveSpanLabel(r.startDate, r.endDate, Boolean(r.isHalfDay))} · {r.reason}</span>
                </span>
                <StatusPill status={r.status} />
              </ListRow>
            ))}
          </ListRows>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-2 sm:px-[23px]">No leave requests yet.</p>
        )}
      </ListCard>
    </div>
  )
}
