import Link from 'next/link'
import { ChevronLeft, ChevronRight, ListChecks } from 'lucide-react'
import { computeDay, type OfficeHours, type PunchType } from '@/lib/attendance-core'
import { DEFAULT_BREAK_POLICIES, payableMinutes, type BreakPolicies } from '@/lib/break-types'
import { formatDuration, formatMonth, formatTime, monthOf, shiftMonth } from '@/lib/dates'
import { buildHref, type SearchParams } from '@/lib/list'
import { statusLabel } from '@/lib/status'
import { DEFAULT_LOCALE, dynamicKey, translator, type Locale } from '@/lib/i18n'
import { MonthCalendar } from '@/components/ui/month-calendar'
import { SegmentedBar } from '@/components/ui/progress'
import { Swatch } from '@/components/ui/swatch'
import type { MonthAttendance } from '@/modules/work/dashboard/attendance'

type DayRow = { date: string; status: string; punches?: { type: string; at: Date | string; breakType?: string | null }[] | null }

/** The Figma attendance palette (bar segments, day pills and legend keys). */
const ON_TIME = '#6DEDBF'
const LATE = '#E4BD6D'
const ABSENT = '#F5548C'

/** One line for the picked day: status, in/out, effective (worked) and payable hours. */
function dayLine(row: DayRow | undefined, selected: string, today: string, hours: OfficeHours, breaks: BreakPolicies, locale: Locale): string {
  const t = translator(locale)
  if (!row) return selected > today ? t('status.upcoming') : t('att.noRecord')
  const punches = (row.punches ?? []).map((p) => ({ type: p.type as PunchType, at: p.at, breakType: p.breakType }))
  // A past day with a forgotten check-out stops at its last punch, as the register counts it.
  const lastPunch = punches.reduce((max, p) => Math.max(max, new Date(p.at).getTime()), 0)
  const now = selected < today && lastPunch ? new Date(lastPunch) : new Date()
  const day = computeDay({ punches, status: row.status }, hours, now)
  const english = statusLabel(row.status === 'present' ? 'on_time' : row.status)
  const parts = [locale === 'en' ? english : row.status === 'present' ? t('att.legend.onTime') : dynamicKey('status.', row.status, english, locale)]
  if (day.firstIn) parts.push(`${t('att.in', { time: formatTime(day.firstIn) })}${day.lastOut ? `, ${t('att.out', { time: formatTime(day.lastOut) })}` : ''}`)
  if (day.workedMinutes) {
    const payable = payableMinutes(day.workedMinutes, day.breakByType, breaks)
    parts.push(payable === day.workedMinutes ? formatDuration(day.workedMinutes) : t('att.effectivePayable', { effective: formatDuration(day.workedMinutes), payable: formatDuration(payable) }))
  }
  return parts.join(' · ')
}

/**
 * "My attendance" (Figma): an opaque card, the round-key legend, the THICK 48px segmented bar with ticks and
 * percentages, the big date with the month switcher, and the month of status-filled day pills.
 */
export function AttendanceCard({ month, today, selected, summary, rows, hours, breaks = DEFAULT_BREAK_POLICIES, sp, fullHref, locale = DEFAULT_LOCALE }: { month: string; today: string; selected: string; summary: MonthAttendance; rows: DayRow[]; hours: OfficeHours; breaks?: BreakPolicies; sp: SearchParams; fullHref?: string; locale?: Locale }) {
  const t = translator(locale)
  const current = monthOf(today)
  const href = (patch: Record<string, string | undefined>) => buildHref('/app', sp, patch)
  const row = rows.find((r) => r.date === selected)
  const nextMonth = month < current ? href({ month: shiftMonth(month, 1), day: undefined }) : undefined
  const legend = [
    { label: t('att.legend.onTime'), color: ON_TIME },
    { label: t('att.legend.late'), color: LATE },
    { label: t('att.legend.absent'), color: ABSENT },
  ]
  const nav = 'inline-flex size-6 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08]'

  return (
    <section aria-label={t('att.title')} className="card-solid @container flex h-full min-h-[375px] flex-col rounded-[10px] px-3 pb-5 pt-[18px]">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-[23px]">
        <div className="-ml-[9px] min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white">
            <ListChecks className="size-4" strokeWidth={1.5} />
            {fullHref ? (
              <Link href={fullHref} className="transition-opacity hover:opacity-80">
                {t('att.title')}
              </Link>
            ) : (
              t('att.title')
            )}
          </h2>
          <p className="mt-0.5 text-[13px] text-[#939395]">{t('att.ownRecord')}</p>
        </div>
        <ul className="flex items-center gap-[11px] pt-px text-sm text-white">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-[5px]">
              <Swatch color={l.color} shape="round" />
              {l.label}
            </li>
          ))}
        </ul>
      </header>

      <SegmentedBar
        className="mt-[18px] pr-[19px]"
        showLegend={false}
        segments={[
          { label: t('att.legend.onTime'), value: summary.onTime, tone: 'success', color: ON_TIME },
          { label: t('att.legend.late'), value: summary.late + summary.halfDay, tone: 'warning', color: LATE },
          { label: t('att.legend.absent'), value: summary.absent, tone: 'danger', color: ABSENT },
        ]}
      />

      <div className="mt-6 grid flex-1 items-center gap-6 @min-[500px]:grid-cols-[176px_1fr] @min-[500px]:gap-0">
        <div className="flex flex-col items-center text-center">
          <span className="text-[56px] font-semibold leading-[60px] tabular-nums text-white">{selected.slice(8)}</span>
          <div className="mt-1.5 flex items-center gap-2">
            <Link href={href({ month: shiftMonth(month, -1), day: undefined })} scroll={false} className={nav} aria-label={t('common.previousMonth')}>
              <ChevronLeft className="size-3.5" strokeWidth={1.75} />
            </Link>
            <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-white">{formatMonth(month)}</span>
            {nextMonth ? (
              <Link href={nextMonth} scroll={false} className={nav} aria-label={t('common.nextMonth')}>
                <ChevronRight className="size-3.5" strokeWidth={1.75} />
              </Link>
            ) : (
              <span className="size-6" />
            )}
          </div>
          <p className="mt-2 max-w-[170px] text-xs leading-4 text-fg-2">{dayLine(row, selected, today, hours, breaks, locale)}</p>
        </div>
        <MonthCalendar month={month} marks={summary.marks} selected={selected} dayHref={(d) => href({ month, day: d })} hideHeader className="w-full max-w-[343px] justify-self-center @min-[500px]:justify-self-end" />
      </div>
    </section>
  )
}
