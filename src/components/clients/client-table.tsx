import Link from 'next/link'
import { formatDate, timeAgo } from '@/lib/dates'
import { formatINRCompact } from '@/lib/money'
import type { Column } from '@/components/ui/data-table'
import { ClientMark } from '@/components/clients/client-mark'
import { ClientStatusPill } from '@/components/clients/client-status-pill'
import type { ClientCardRow, ClientRowFlags } from '@/modules/clients/view-model'
import { HealthBadge, HoursVsRetainer, MarginValue, OverdueValue } from './client-signals'

const DASH = <span className="text-[#979797]">—</span>

/** Columns of the clients list view; product columns appear only when the viewer has that product. */
export function clientTableColumns(flags: ClientRowFlags): Column<ClientCardRow>[] {
  return [
    {
      key: 'name', header: 'Client',
      cell: (c) => (
        <span className="flex items-center gap-2.5">
          <ClientMark name={c.name} kind={c.kind} logoUrl={c.logoUrl} />
          <span className="min-w-0"><Link href={`/app/clients/${c.id}`} className="block truncate text-sm text-white transition-colors hover:text-blush">{c.name}</Link>{c.ownerName ? <span className="block truncate text-xs text-[#979797]">{c.ownerName}</span> : null}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (c) => <ClientStatusPill status={c.status} /> },
    { key: 'health', header: 'Health', cell: (c) => <HealthBadge health={c.health} /> },
    ...(flags.work ? [{ key: 'hours', header: 'Hours this month', hideOnMobile: true, cell: (c: ClientCardRow) => <HoursVsRetainer minutes={c.minutesThisMonth} retainerHours={c.retainerHours} compact /> }] : []),
    ...(flags.margin ? [{ key: 'margin', header: 'Margin', align: 'right' as const, hideOnMobile: true, cell: (c: ClientCardRow) => (c.margin ? <MarginValue margin={c.margin} /> : DASH) }] : []),
    ...(flags.orbit ? [{ key: 'pipeline', header: 'Pipeline', align: 'right' as const, hideOnMobile: true, cell: (c: ClientCardRow) => (c.pipelinePaise ? <span className="tabular-nums">{formatINRCompact(c.pipelinePaise)}</span> : DASH) }] : []),
    ...(flags.folio ? [{ key: 'overdue', header: 'Overdue', align: 'right' as const, cell: (c: ClientCardRow) => <OverdueValue paise={c.overduePaise} /> }] : []),
    { key: 'activity', header: 'Last activity', hideOnMobile: true, className: 'whitespace-nowrap', cell: (c) => <span className="text-[13px] text-[#979797]">{c.lastActivityAt ? timeAgo(c.lastActivityAt) : '—'}</span> },
    { key: 'onboarded', header: 'Onboarded', hideOnMobile: true, className: 'whitespace-nowrap', cell: (c) => <span className="text-[13px] text-[#979797]">{c.onboardedAt ? formatDate(c.onboardedAt) : '—'}</span> },
  ]
}
