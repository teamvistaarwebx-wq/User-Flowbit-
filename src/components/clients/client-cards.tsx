import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatDate, timeAgo } from '@/lib/dates'
import { ClientMark } from '@/components/clients/client-mark'
import { ClientStatusPill } from '@/components/clients/client-status-pill'
import type { ClientCardRow, ClientRowFlags } from '@/modules/clients/view-model'
import { HealthBadge, HoursVsRetainer, MarginValue, OverdueValue } from './client-signals'

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.04em] text-[#979797]">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-white">{children}</dd>
    </div>
  )
}

/** One client as a card: logo, status and health, then the numbers that say how the account is going. */
function ClientCard({ row, flags }: { row: ClientCardRow; flags: ClientRowFlags }) {
  return (
    <li className="glass lift relative flex flex-col gap-4 rounded-[12px] bg-white/[0.015] p-4">
      <div className="flex items-start gap-3">
        <ClientMark name={row.name} kind={row.kind} size="lg" logoUrl={row.logoUrl} />
        <div className="min-w-0 flex-1">
          <Link href={`/app/clients/${row.id}`} className="block truncate font-medium text-white transition-colors after:absolute after:inset-0 hover:text-blush">
            {row.name}
          </Link>
          <span className="block truncate text-xs text-[#979797]">{row.ownerName ? `Owner ${row.ownerName}` : row.displayName ?? '—'}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ClientStatusPill status={row.status} />
          {row.health ? <HealthBadge health={row.health} /> : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {flags.work ? <Stat label="Hours this month"><HoursVsRetainer minutes={row.minutesThisMonth} retainerHours={row.retainerHours} /></Stat> : null}
        {flags.margin && row.margin ? <Stat label="Margin (90 days)"><MarginValue margin={row.margin} /></Stat> : null}
        {flags.folio ? <Stat label="Overdue"><OverdueValue paise={row.overduePaise} /></Stat> : null}
        <Stat label="Last activity">{row.lastActivityAt ? timeAgo(row.lastActivityAt) : '—'}</Stat>
        <Stat label="Onboarded">{row.onboardedAt ? formatDate(row.onboardedAt) : '—'}</Stat>
      </dl>
    </li>
  )
}

export function ClientCards({ rows, flags, empty }: { rows: ClientCardRow[]; flags: ClientRowFlags; empty: ReactNode }) {
  if (!rows.length) return <>{empty}</>
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <ClientCard key={r.id} row={r} flags={flags} />
      ))}
    </ul>
  )
}
