import type { Metadata } from 'next'
import { pendingInMonth } from '@/modules/muster/attendance/lock'
import { pendingSummary } from '@/modules/muster/attendance/pending-copy'
import Link from 'next/link'
import { Download, FileUp, ListChecks, Lock, Users } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember, type Ctx } from '@/lib/ctx'
import { formatDate, formatDateTime, formatMonth, monthOf, monthRange, todayIST } from '@/lib/dates'
import { buildHref, first, type SearchParams } from '@/lib/list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonClass } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { LinkTabs } from '@/components/ui/tabs'
import { Notice } from '@/components/settings/surface'
import { importHref } from '@/modules/imports/entry'
import { DaySheet } from '@/components/muster/attendance/day-sheet'
import { DaySwitcher } from '@/components/muster/attendance/day-switcher'
import { BiometricImportPanel } from '@/components/muster/attendance/biometric-panel'
import { LockControls } from '@/components/muster/attendance/lock-controls'
import { MonthSwitcher } from '@/components/muster/attendance/month-switcher'
import { RegisterGrid } from '@/components/muster/attendance/register-grid'
import { TrendCard } from '@/components/muster/attendance/trend-card'
import { FiguresCard } from '@/components/muster/ui/figures'
import { FilterChips } from '@/components/muster/ui/filter-chips'
import { Note } from '@/components/muster/ui/note'
import { getDaySheet } from '@/modules/muster/attendance/day-sheet'
import { getMonthRegister } from '@/modules/muster/attendance/queries'
import { resolveRange } from '@/modules/muster/attendance/range'
import { attendanceTrend } from '@/modules/muster/attendance/trend'
import { peopleOptions } from '@/modules/muster/people/queries'
import { mayManageLogins } from '@/modules/muster/people/scope'
import { UNMARKED_POLICY_COPY } from '@/modules/muster/settings/defaults'

/** Server actions on this page can render PDFs, send email or process many rows. */
export const maxDuration = 300

export const metadata: Metadata = { title: 'Attendance' }

const BASE = '/app/hr/attendance'
const VIEWS = ['day', 'month', 'trends', 'import'] as const
type View = (typeof VIEWS)[number]
const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function PolicyCallout({ ctx, title, policy }: { ctx: Ctx; title: string; policy: keyof typeof UNMARKED_POLICY_COPY }) {
  return (
    <Note className="mb-3" title={title}>
      {UNMARKED_POLICY_COPY[policy]}
      {ctx.can('hr.settings') ? <> Change this in <Link href="/app/hr/settings?tab=attendance" className="text-link underline-offset-2 hover:underline">attendance rules</Link>.</> : ' HR admins can change this in attendance rules.'}
    </Note>
  )
}

/** People on the sheet whose employee record has no login: their check-ins cannot reach it. */
function UnlinkedNote({ ctx, count }: { ctx: Ctx; count: number }) {
  if (!count || !ctx.can('people.write')) return null
  const who = `${count} ${count === 1 ? 'person has' : 'people have'} no Flowbit login linked to their employee record, so their check-ins cannot show here.`
  return (
    <Note
      tone="warning"
      className="mb-3"
      title={who}
      action={mayManageLogins(ctx) ? <Button size="sm" variant="secondary" href="/app/hr/people?filter=nologin&link=1">Link logins</Button> : undefined}
    >
      {mayManageLogins(ctx) ? 'Link them once and their past check-ins move over too.' : 'An HR admin can link them in People → Link logins.'}
    </Note>
  )
}

const notLinked = (ctx: Ctx, seesEveryone: boolean) => (
  <EmptyState
    icon={<Users />}
    title={seesEveryone || ctx.member.employeeId ? 'Nobody was employed on these days' : 'Your account is not linked to an employee record'}
    description={seesEveryone ? 'People appear here from their joining date.' : 'Ask HR to link your login to your employee record.'}
    action={ctx.can('people.write') ? <Button variant="primary" href="/app/hr/people/new">Add employee</Button> : undefined}
  />
)

async function DayView({ ctx, date, dept }: { ctx: Ctx; date: string; dept?: string }) {
  const sheet = await getDaySheet(ctx, date, { departmentId: dept })
  const canEdit = ctx.can('attendance.manage') && !sheet.locked
  if (!sheet.rows.length) return notLinked(ctx, sheet.seesEveryone)
  return (
    <>
      <UnlinkedNote ctx={ctx} count={sheet.rows.filter((r) => !r.memberId).length} />
      {sheet.locked ? <p className="mb-3 text-sm text-fg-2">{formatMonth(date.slice(0, 7))} is locked, so this day is read-only. Reopen the month to change it.</p> : null}
      {canEdit && sheet.unmarked > 0 ? <PolicyCallout ctx={ctx} title={`${sheet.unmarked} ${sheet.unmarked === 1 ? 'person has' : 'people have'} no record for this day.`} policy={sheet.unmarkedPolicy} /> : null}
      <DaySheet key={date} date={date} rows={sheet.rows} canEdit={canEdit} departmentId={dept} />
    </>
  )
}

async function MonthView({ ctx, month, dept, today }: { ctx: Ctx; month: string; dept?: string; today: string }) {
  const register = await getMonthRegister(ctx, month, { departmentId: dept })
  const pending = !register.locked && ctx.can('attendance.lock') ? pendingSummary(await pendingInMonth(ctx, monthRange(month).start, monthRange(month).end)) : null
  const rows = register.rows
  const people = rows.length || 1
  const payable = sum(rows.map((r) => r.summary.payableDays))
  const lop = sum(rows.map((r) => r.summary.lopDays))
  const leave = sum(rows.map((r) => r.summary.leaveDays))
  const unmarked = sum(rows.map((r) => r.summary.unmarkedDays + r.summary.assumedDays))
  const canEdit = ctx.can('attendance.manage') && !register.locked
  return (
    <>
      <UnlinkedNote ctx={ctx} count={rows.filter((r) => !r.memberId).length} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-2">{register.locked ? `${formatMonth(month)} is locked${register.period?.lockedByName ? ` by ${register.period.lockedByName}` : ''}${register.period?.lockedAt ? ` on ${formatDateTime(register.period.lockedAt)}` : ''}.` : `${formatMonth(month)}: check-ins fill it; click a past day to change it.`}</p>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSwitcher month={month} basePath={BASE} params={{ view: 'month', month, ...(dept ? { dept } : {}) }} />
          <a className={buttonClass('secondary')} href={buildHref('/api/muster/attendance/export', {}, { month, dept })} download><Download className="size-4" /> Export</a>
          {register.seesEveryone ? <LockControls month={month} locked={register.locked} canLock={ctx.can('attendance.lock')} ended={monthRange(month).end < today} pending={pending} /> : null}
          {register.locked ? <Badge tone="orchid" icon={<Lock className="size-3" />}>Locked</Badge> : null}
        </div>
      </div>
      <FiguresCard
        className="mb-3"
        items={[
          { label: 'People on the sheet', value: rows.length, hint: `${register.workdays.length} working days this month` },
          { label: 'Payable days', value: payable, hint: `${Math.round((payable / people) * 10) / 10} per person` },
          { label: 'Loss of pay', value: lop, tone: lop > 0 ? 'danger' : undefined, hint: lop > 0 ? 'Costs pay' : 'Nobody loses pay' },
          { label: 'Paid leave', value: leave, hint: `${Math.round((leave / people) * 10) / 10} per person` },
        ]}
      />
      {canEdit && unmarked > 0 ? <PolicyCallout ctx={ctx} title={`${unmarked} working ${unmarked === 1 ? 'day has' : 'days have'} no record.`} policy={register.unmarkedPolicy} /> : null}
      {rows.length ? <RegisterGrid days={register.days} rows={rows} holidayNames={register.holidayNames} canEdit={canEdit} today={today} /> : notLinked(ctx, register.seesEveryone)}
    </>
  )
}

async function TrendsView({ ctx, sp, dept }: { ctx: Ctx; sp: SearchParams; dept?: string }) {
  const range = resolveRange({ range: first(sp.range), from: first(sp.from), to: first(sp.to) }, todayIST())
  const trend = await attendanceTrend(ctx, range, { departmentId: dept })
  return (
    <div className="space-y-3">
      <TrendCard trend={trend} basePath={BASE} params={sp} />
      <div className="flex justify-end">
        <a className={buttonClass('secondary', 'sm')} href={buildHref('/api/muster/attendance/export', {}, { from: range.start, to: range.end, dept })} download><Download className="size-3.5" /> Export {range.start === range.end ? formatDate(range.start) : `${formatDate(range.start)} – ${formatDate(range.end)}`} as CSV</a>
      </div>
    </div>
  )
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'attendance.read' })
  const today = todayIST()
  const canImport = ctx.can('attendance.manage')
  const rawMonth = first(sp.month)
  const requested = (first(sp.view) ?? (rawMonth ? 'month' : undefined)) as View | undefined
  const view: View = requested && VIEWS.includes(requested) && (requested !== 'import' || canImport) ? requested : 'day'
  const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : monthOf(today)
  const rawDate = first(sp.date)
  const date = rawDate && ISO_DAY.test(rawDate) && rawDate <= today ? rawDate : today
  const dept = first(sp.dept)
  const options = await peopleOptions(ctx)
  const tabs = [
    { href: BASE, label: 'Day' },
    { href: `${BASE}?view=month`, label: 'Month' },
    { href: `${BASE}?view=trends`, label: 'Trends' },
    ...(canImport ? [{ href: `${BASE}?view=import`, label: 'Import' }] : []),
  ]

  return (
    <>
      <PageHeader
        title="Attendance"
        help="month-lock"
        description={view === 'day' ? `${formatDate(date, { withWeekday: true })}. Tap a status to save it.` : view === 'import' ? 'Bring in punches from a biometric device. For the Flowbit spreadsheet template, use the attendance importer.' : 'Who came in, worked from home, took leave or was away.'}
        breadcrumb={breadcrumbFor(BASE)}
        actions={
          <>
            {view === 'day' ? <DaySwitcher date={date} today={today} basePath={BASE} params={sp} /> : null}
            {ctx.can('attendance.approve') ? <Button variant="secondary" icon={<ListChecks className="size-4" />} href={`${BASE}/corrections`}>Corrections</Button> : null}
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <LinkTabs tabs={tabs} />
          {view !== 'import' ? (
            <FilterChips label="Team" items={[{ href: buildHref(BASE, sp, { dept: undefined }), label: 'All teams', active: !dept, key: 'all' }, ...options.departments.map((d) => ({ href: buildHref(BASE, sp, { dept: d.value }), label: d.label, active: dept === d.value, key: d.value }))]} />
          ) : null}
        </div>
      </PageHeader>
      {view === 'day' ? <DayView ctx={ctx} date={date} dept={dept} /> : null}
      {view === 'month' ? <MonthView ctx={ctx} month={month} dept={dept} today={today} /> : null}
      {view === 'trends' ? <TrendsView ctx={ctx} sp={sp} dept={dept} /> : null}
      {view === 'import' ? (
        <>
          <Notice tone="info" className="mb-4" action={<Button size="sm" variant="secondary" icon={<FileUp className="size-4" />} href={importHref('attendance', 'attendance')}>Import from the template</Button>}>
            A spreadsheet in the Flowbit template goes through Settings → Import, with a preview and 7-day undo.
          </Notice>
          <BiometricImportPanel employees={options.managers} />
        </>
      ) : null}
    </>
  )
}
