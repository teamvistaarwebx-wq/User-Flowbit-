import type { Metadata } from 'next'
import { CalendarHeart, ClipboardList, Plane, Send } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { todayIST } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { StatusPill } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { ListCard, TABLE } from '@/components/muster/ui/list-card'
import { NotLinked } from '@/components/muster/me/not-linked'
import { LeaveApplyForm, WithdrawLeave } from '@/components/muster/me/request-forms'
import { LeaveRequest } from '@/models/muster/LeaveRequest'
import { currentStage } from '@/modules/muster/leave/approvals'
import { WAITING_ON } from '@/modules/muster/me/details'
import { getLeaveBalances } from '@/modules/muster/leave/balances'
import { daysLabel, leaveSpanLabel } from '@/modules/muster/leave/days'
import { leaveTypeOptions } from '@/modules/muster/leave/queries'
import { myEmployee } from '@/modules/muster/me/queries'
import { dynamicKey, localeOfUser, translator } from '@/lib/i18n'

export const metadata: Metadata = { title: 'My leave' }
const BASE = '/app/me/leave'

export default async function MyLeavePage() {
  const ctx = await requireMember({ product: 'muster' })
  const locale = localeOfUser(ctx.user)
  const t = translator(locale)
  const employee = await myEmployee(ctx)
  if (!employee) return <NotLinked locale={locale} />
  const today = todayIST()
  const [balances, types, requests] = await Promise.all([
    getLeaveBalances(ctx, employee, today),
    leaveTypeOptions(ctx),
    ctx.db(LeaveRequest).find({ employeeId: employee._id }).sort({ startDate: -1 }).limit(50).lean(),
  ])

  return (
    <>
      <PageHeader title={t('leave.title')} description={t('leave.description', { year: balances.year.label })} breadcrumb={breadcrumbFor(BASE)} />
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 self-start rounded-[14px] lg:col-span-5">
          <CardHeader label={t('leave.left')} icon={<CalendarHeart />} />
          {balances.rows.length ? (
            <ul>
              {balances.rows.map((r) => (
                <li key={r.typeId} className="flex items-center justify-between gap-3 border-b border-white/[0.1] py-3 last:border-0">
                  <span>
                    <span className="block text-sm text-white">{r.name}</span>
                    <span className="block text-xs text-fg-2">
                      {r.remaining === null ? (r.perRequestCap ? t('leave.upTo', { n: r.perRequestCap }) : t('leave.perRequest')) : r.accrues ? `${r.opening ? t('leave.carried', { n: r.opening }) : ''}${t('leave.earned', { n: r.accrued })}${r.adjusted ? t('leave.adjusted', { n: `${r.adjusted > 0 ? '+' : ''}${r.adjusted}` }) : ''}${t('leave.taken', { n: r.taken })}` : t('leave.noAccrual')}
                      {r.pending ? t('leave.pendingN', { n: r.pending }) : ''}
                    </span>
                  </span>
                  <span className="text-2xl font-semibold leading-[30px] tabular-nums text-white">{r.remaining === null ? '—' : r.remaining}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-2">{t('leave.noTypes')}</p>
          )}
        </Card>
        <Card variant="solid" className="col-span-12 lg:col-span-7">
          <CardHeader label={t('leave.apply')} icon={<Send />} description={t('leave.applyDescription')} />
          <LeaveApplyForm types={types.map((t) => ({ value: t.value, label: t.label, allowHalfDay: t.allowHalfDay }))} today={today} />
        </Card>
        <ListCard className="col-span-12" label={t('leave.requests')} icon={<ClipboardList />} description={t('leave.requestsCount', { n: requests.length })}>
          {requests.length ? (
            <div className="overflow-x-auto">
              <table className={TABLE.table}>
                <thead>
                  <tr className={TABLE.headRow}>
                    <th className={cn(TABLE.th, 'px-5')}>{t('leave.type')}</th>
                    <th className={cn(TABLE.th, 'px-5')}>{t('leave.dates')}</th>
                    <th className={cn(TABLE.th, 'px-5')}>{t('leave.days')}</th>
                    <th className={cn(TABLE.th, 'hidden px-5 md:table-cell')}>{t('leave.reason')}</th>
                    <th className={cn(TABLE.th, 'px-5')}>{t('common.status')}</th>
                    <th className={cn(TABLE.th, 'px-5')} />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const stage = r.status === 'pending' ? currentStage(r.stages, r.completedStages) : null
                    const span = leaveSpanLabel(r.startDate, r.endDate, r.isHalfDay)
                    return (
                      <tr key={String(r._id)} className={TABLE.row}>
                        <td className="px-5 py-2.5 text-white">{r.leaveName}</td>
                        <td className="px-5 py-2.5 text-[#979797]">{span}</td>
                        <td className="px-5 py-2.5 tabular-nums text-white/85">
                          {daysLabel(r.dayCount)}
                          {r.unpaidDays ? <span className="block text-xs text-[#FF6A66]">{t('leave.lopN', { n: r.unpaidDays })}</span> : null}
                        </td>
                        <td className="hidden max-w-xs truncate px-5 py-2.5 text-fg-2 md:table-cell">{r.reason}</td>
                        <td className="px-5 py-2.5">
                          <StatusPill status={r.status} />
                          {stage ? <span className="mt-1 block text-xs text-fg-2">{t('common.withWho', { who: dynamicKey('common.waiting.', stage, WAITING_ON[stage] ?? stage, locale) })}</span> : r.decisionNote ? <span className="mt-1 block text-xs text-fg-2">{r.decisionNote}</span> : null}
                        </td>
                        <td className="px-5 py-2.5 text-right">{r.status === 'pending' ? <WithdrawLeave id={String(r._id)} label={`${r.leaveName}, ${span}`} /> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact icon={<Plane />} title={t('leave.none')} description={t('leave.noneHint')} />
          )}
        </ListCard>
      </div>
    </>
  )
}
