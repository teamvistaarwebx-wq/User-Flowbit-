import type { Metadata } from 'next'
import { attendanceTally } from '@/modules/muster/me/tally'
import Link from 'next/link'
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardList, ListChecks, MapPin, Pencil } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, formatMonth, monthOf, monthRange, shiftMonth, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { Badge, StatusPill } from '@/components/ui/badge'
import { Card, CardHeader } from '@/components/ui/card'
import { MonthCalendar, type DayMark } from '@/components/ui/month-calendar'
import { PageHeader } from '@/components/ui/page-header'
import { SegmentedBar } from '@/components/ui/progress'
import { Swatch } from '@/components/ui/swatch'
import { FiguresCard } from '@/components/muster/ui/figures'
import { ListCard, ListRow, ListRows } from '@/components/muster/ui/list-card'
import { NotLinked } from '@/components/muster/me/not-linked'
import { CompOffForm, CorrectionForm } from '@/components/muster/me/request-forms'
import { AttendanceDay } from '@/models/AttendanceDay'
import { AttendanceCorrection } from '@/models/muster/AttendanceCorrection'
import { checkInPlace, formatDistance, type CheckInPlace } from '@/modules/muster/attendance/check-in-place'
import { CompOff } from '@/models/muster/CompOff'
import { CORRECTABLE_STATUSES, windowHint } from '@/modules/muster/attendance/correction'
import { getMonthRegister } from '@/modules/muster/attendance/queries'
import { CELL_META } from '@/modules/muster/attendance/register'
import { currentStage } from '@/modules/muster/leave/approvals'
import { WAITING_ON } from '@/modules/muster/me/details'
import { myEmployee } from '@/modules/muster/me/queries'
import { getPolicy } from '@/modules/muster/settings/queries'
import { dynamicKey, localeOfUser, translator, type MessageKey } from '@/lib/i18n'

export const metadata: Metadata = { title: 'My attendance' }
const BASE = '/app/me/attendance'
/** The Figma attendance palette: mint on time, amber late, pink absent (bar segments and round legend keys). */
const LEGEND: { label: MessageKey; color: string }[] = [
  { label: 'att.legend.onTime', color: '#6DEDBF' },
  { label: 'att.legend.late', color: '#E4BD6D' },
  { label: 'att.legend.absent', color: '#F5548C' },
  { label: 'att.legend.halfDay', color: '#8E8DFF' },
]

export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster' })
  const locale = localeOfUser(ctx.user)
  const t = translator(locale)
  const statusText = (status: string) => dynamicKey('status.', status, CELL_META[status as keyof typeof CELL_META]?.label ?? status, locale)
  const employee = await myEmployee(ctx)
  if (!employee) return <NotLinked locale={locale} canAddSelf={ctx.can('people.write')} />
  const today = todayIST()
  const raw = first(sp.month) ?? ''
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : monthOf(today)
  const { start, end } = monthRange(month)
  const [register, policy, corrections, compOffs, punchDays] = await Promise.all([
    getMonthRegister(ctx, month, { employeeIds: [String(employee._id)] }),
    getPolicy(ctx),
    ctx.db(AttendanceCorrection).find({ employeeId: employee._id, kind: 'request' }).sort({ createdAt: -1 }).limit(20).lean(),
    ctx.db(CompOff).find({ employeeId: employee._id }).sort({ workedOn: -1 }).limit(10).lean(),
    // Own check-ins only (this member), for where each one happened.
    ctx.db(AttendanceDay).find({ memberId: ctx.memberId, date: { $gte: start, $lte: end } }, { date: 1, punches: 1 }).lean(),
  ])
  const places = new Map<string, CheckInPlace>(punchDays.flatMap((d) => {
    const place = checkInPlace(d.punches.find((p) => p.type === 'in' && p.geo)?.geo)
    return place ? [[d.date, place] as const] : []
  }))
  const placeText = (p: CheckInPlace) =>
    p.kind === 'office' ? t('att.place.office', { office: p.office ?? '' }) : p.kind === 'outside' ? (p.office && p.distanceM !== null ? t('att.place.outside', { office: p.office, distance: formatDistance(p.distanceM) }) : t('att.place.outsideNoOffice')) : t('att.place.recorded')
  const row = register.rows[0]
  const s = row?.summary
  const marks: Record<string, DayMark> = Object.fromEntries((row?.cells ?? []).filter((c) => c.status !== 'na' && c.status !== 'upcoming').map((c) => [c.date, { tone: CELL_META[c.status].tone, label: c.assumed ? `${statusText(c.status)} (${t('att.notMarked')})` : (c.note ?? statusText(c.status)) }]))
  // Days that have happened, newest first; the calendar already shows what is still to come.
  const days = (row?.cells ?? []).filter((c) => c.date >= start && c.date <= end && c.date <= today && c.status !== 'na' && c.status !== 'upcoming').slice().reverse()

  // The Figma attendance bar: on time, late and absent days actually recorded (assumed days are left out).
  const tally = attendanceTally(row?.cells ?? [])
  const isCurrent = month === monthOf(today)
  const nav = 'inline-flex size-6 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08]'

  return (
    <>
      <PageHeader title={t('att.title')} help="attendance-vs-time" description={t('att.description', { month: formatMonth(month) })} breadcrumb={breadcrumbFor(BASE)} />
      <FiguresCard
        className="mb-3"
        items={[
          { label: t('att.working'), value: s?.workingDays ?? 0, hint: s?.holidays ? t('att.holidaysIncluded', { n: s.holidays }) : undefined },
          { label: t('att.payable'), value: s?.payableDays ?? 0, hint: s && (s.assumedDays || s.upcomingDays) ? t('me.month.includes', { parts: [s.assumedDays ? t('me.month.notMarked', { n: s.assumedDays }) : '', s.upcomingDays ? t('me.month.toCome', { n: s.upcomingDays }) : ''].filter(Boolean).join(t('me.month.and')) }) : t('att.allRecorded') },
          { label: t('att.lop'), value: s?.lopDays ?? 0, tone: s?.lopDays ? 'danger' : undefined, hint: s?.lopDays ? t('att.lopCosts') : t('att.noLop') },
          { label: t('att.paidLeave'), value: s?.leaveDays ?? 0, hint: s?.unpaidLeaveDays ? t('att.unpaidN', { n: s.unpaidLeaveDays }) : undefined },
        ]}
      />
      <div className="grid grid-cols-12 gap-3">
        {/* The dashboard's "My attendance" card, at full size: legend, the thick bar, the big date and the day pills. */}
        <section aria-label="Month" className="card-solid @container col-span-12 flex flex-col rounded-[10px] px-3 pb-5 pt-[18px] lg:col-span-7">
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-[14px]">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white">
                <ListChecks className="size-4" strokeWidth={1.5} />
                {t('att.title')}
              </h2>
              <p className="mt-0.5 text-[13px] text-[#939395]">{register.locked ? t('att.locked') : t('att.ownRecord')}</p>
            </div>
            <ul className="flex items-center gap-[11px] pt-px text-sm text-white">
              {LEGEND.map((l) => (
                <li key={l.label} className="flex items-center gap-[5px]">
                  <Swatch color={l.color} shape="round" />
                  {t(l.label)}
                </li>
              ))}
            </ul>
          </header>
          <SegmentedBar
            className="mt-[18px] px-[10px]"
            showLegend={false}
            segments={[
              { label: t('att.legend.onTime'), value: tally.onTime, tone: 'success', color: LEGEND[0].color },
              { label: t('att.legend.late'), value: tally.late, tone: 'warning', color: LEGEND[1].color },
              { label: t('att.legend.absent'), value: tally.absent, tone: 'danger', color: LEGEND[2].color },
              { label: t('att.legend.halfDay'), value: tally.halfDay, tone: 'info', color: LEGEND[3].color },
            ]}
          />
          <div className="mt-6 grid flex-1 items-center gap-6 @min-[500px]:grid-cols-[176px_1fr] @min-[500px]:gap-0">
            <div className="flex flex-col items-center text-center">
              <span className="text-[56px] font-semibold leading-[60px] tabular-nums text-white">{isCurrent ? today.slice(8) : end.slice(8)}</span>
              <div className="mt-1.5 flex items-center gap-2">
                <Link href={`${BASE}?month=${shiftMonth(month, -1)}`} scroll={false} className={nav} aria-label={t('common.previousMonth')}>
                  <ChevronLeft className="size-3.5" strokeWidth={1.75} />
                </Link>
                <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{formatMonth(month)}</span>
                <Link href={`${BASE}?month=${shiftMonth(month, 1)}`} scroll={false} className={nav} aria-label={t('common.nextMonth')}>
                  <ChevronRight className="size-3.5" strokeWidth={1.75} />
                </Link>
              </div>
              <p className="mt-2 max-w-[170px] text-xs leading-4 text-fg-2">{isCurrent ? t('common.today') : t('att.payableN', { n: s?.payableDays ?? 0 })}</p>
            </div>
            <MonthCalendar month={month} marks={marks} selected={isCurrent ? today : undefined} hideHeader className="w-full max-w-[343px] justify-self-center @min-[500px]:justify-self-end" />
          </div>
        </section>
        <ListCard className="col-span-12 lg:col-span-5" label={t('att.dayByDay')} icon={<ClipboardList />} description={register.locked ? t('att.lockedShort') : t('att.latestFirst')}>
          {days.length ? null : <p className="px-5 py-6 text-sm text-fg-2 sm:px-[23px]">{t('att.nothing')}</p>}
          <ul className="scroll-fade-y max-h-[420px] overflow-y-auto py-1.5 empty:hidden">
            {days.map((c) => (
              <li key={c.date} className="flex min-h-10 items-center justify-between gap-3 px-5 py-1.5 text-sm transition-colors duration-150 hover:bg-white/[0.04] sm:px-[23px]">
                <span className="min-w-0">
                  <span className="block text-white/85">{formatDate(c.date, { withWeekday: true })}</span>
                  {places.get(c.date) ? (
                    <span className="flex items-center gap-1 text-xs text-fg-3">
                      <MapPin className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="truncate">{placeText(places.get(c.date) as CheckInPlace)}</span>
                      {places.get(c.date)?.mapUrl ? <a href={places.get(c.date)?.mapUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="shrink-0 text-link hover:underline">{t('att.place.map')}</a> : null}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  {c.note && c.source !== 'policy' ? <span className="hidden text-xs text-fg-2 sm:inline">{c.note}</span> : null}
                  <Badge tone={c.status === 'upcoming' || c.assumed ? 'neutral' : CELL_META[c.status].tone} className={c.assumed || c.status === 'upcoming' ? 'opacity-60' : undefined}>
                    {c.status === 'upcoming' ? t('status.upcoming') : c.assumed ? `${statusText(c.status)} · ${t('att.notMarked')}` : statusText(c.status)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
          {places.size ? <p className="flex gap-1.5 border-t border-white/[0.06] px-5 pb-1 pt-3 text-xs text-fg-3 sm:px-[23px]"><MapPin className="mt-0.5 size-3 shrink-0" strokeWidth={1.75} aria-hidden />{t('att.place.privacy')}</p> : null}
        </ListCard>
        <Card variant="solid" className="col-span-12 lg:col-span-7">
          <CardHeader label={t('att.correction.label')} icon={<Pencil />} description={t('att.correction.description')} />
          <CorrectionForm statuses={CORRECTABLE_STATUSES.map((st) => ({ value: st, label: statusText(st) }))} today={today} hint={windowHint(policy.attendance.correctionWindowHours)} />
        </Card>
        <ListCard className="col-span-12 lg:col-span-5" label={t('att.corrections.label')} icon={<ClipboardList />} description={t('att.corrections.description')}>
          {corrections.length ? (
            <ListRows>
              {corrections.map((c) => {
                const stage = c.status === 'pending' ? currentStage(c.stages, c.completedStages) : null
                return (
                  <ListRow key={String(c._id)} className="block">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white">{formatDate(c.date)}: {statusText(c.currentStatus ?? 'unmarked')} → {statusText(c.requestedStatus)}</span>
                      <StatusPill status={c.status} />
                    </div>
                    <p className="text-xs text-fg-2">{stage ? t('common.withWho', { who: dynamicKey('common.waiting.', stage, WAITING_ON[stage] ?? stage, locale) }) : c.decisionNote ?? c.reason}</p>
                  </ListRow>
                )
              })}
            </ListRows>
          ) : (
            <p className="px-5 py-6 text-sm text-fg-2 sm:px-[23px]">{t('att.corrections.none')}</p>
          )}
        </ListCard>
        <Card variant="solid" className="col-span-12">
          <CardHeader label={t('att.compoff.label')} icon={<CalendarPlus />} description={[t('att.compoff.description'), policy.attendance.compOffValidDays ? t('att.compoff.lapses', { n: policy.attendance.compOffValidDays }) : ''].filter(Boolean).join(' ')} />
          <CompOffForm today={today} />
          {compOffs.length ? (
            <ul className="mt-5 border-t border-line">
              {compOffs.map((c) => (
                <li key={String(c._id)} className="flex items-center justify-between gap-2 border-b border-white/[0.08] py-2.5 text-sm last:border-0">
                  <span className="text-white/85">{formatDate(c.workedOn)} · {c.days} {c.days === 1 ? t('common.day') : t('common.days')}{c.expiresOn ? ` · ${t('att.compoff.useBy', { date: formatDate(c.expiresOn) })}` : ''}</span>
                  <StatusPill status={c.status} />
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </>
  )
}
