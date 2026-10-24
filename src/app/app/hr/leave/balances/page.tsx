import type { Metadata } from 'next'
import Link from 'next/link'
import { Scale } from 'lucide-react'
import { breadcrumbFor } from '@/lib/catalog'
import { requireMember } from '@/lib/ctx'
import { formatDate, todayIST } from '@/lib/dates'
import { first, type SearchParams } from '@/lib/list'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { TONE_TEXT } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { ListCard, TABLE } from '@/components/muster/ui/list-card'
import { AdjustBalanceDialog } from '@/components/muster/leave/adjust-balance-dialog'
import { Department } from '@/models/muster/Department'
import { Employee } from '@/models/muster/Employee'
import { teamBalances } from '@/modules/muster/leave/balances'
import { DIRECTORY_STATUSES } from '@/modules/muster/people/lifecycle'
import { visibleEmployeeIds, visibleFilter } from '@/modules/muster/people/scope'

export const metadata: Metadata = { title: 'Leave balances' }

const BASE = '/app/hr/leave/balances'

export default async function LeaveBalancesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const ctx = await requireMember({ product: 'muster', perm: 'leave.read' })
  const raw = first(sp.asOf)
  const asOf = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIST()
  const visible = await visibleEmployeeIds(ctx)
  const [people, departments] = await Promise.all([
    ctx.db(Employee).find({ deletedAt: null, status: { $in: DIRECTORY_STATUSES }, ...visibleFilter(visible) }, { fullName: 1, code: 1, departmentId: 1, employmentType: 1, status: 1, joinDate: 1, exitDate: 1 }).sort({ fullName: 1 }).lean(),
    ctx.db(Department).find({}, { name: 1 }).lean(),
  ])
  const { year, types, byEmployee } = await teamBalances(ctx, people, asOf)
  const deptName = new Map(departments.map((d) => [String(d._id), d.name]))

  return (
    <>
      <PageHeader
        title="Leave balances"
        description={`Leave year ${year.label} (${formatDate(year.start)} – ${formatDate(year.end)}), as of ${formatDate(asOf)}. Remaining = carried + earned + adjusted − taken.`}
        breadcrumb={breadcrumbFor(BASE)}
        back={{ href: '/app/hr/leave', label: 'Leave' }}
        actions={
          <>
            <form className="flex items-center gap-2" action={BASE}>
              <DateInput name="asOf" defaultValue={asOf} aria-label="As of" inputSize="sm" className="w-40" />
              <Button type="submit" size="sm" variant="secondary">Show</Button>
            </form>
            {ctx.can('leave.manage') ? <AdjustBalanceDialog employees={people.map((p) => ({ value: String(p._id), label: `${p.fullName} (${p.code})` }))} types={types.map((t) => ({ value: t.id, label: t.name }))} yearLabel={year.label} /> : null}
          </>
        }
      />
      {people.length && types.length ? (
        <ListCard label="Balances" icon={<Scale />} description={`${people.length} ${people.length === 1 ? 'person' : 'people'} · earned / taken / left per leave type`}>
          <div className="overflow-x-auto">
            <table className={TABLE.table}>
              <thead>
                <tr className={TABLE.headRow}>
                  <th className={cn(TABLE.th, 'py-2')}>Person</th>
                  <th className={cn(TABLE.th, 'hidden py-2 md:table-cell')}>Department</th>
                  {types.map((t) => <th key={t.id} className={cn(TABLE.th, 'py-2 text-right')} title={t.code}>{t.name}<span className="block text-[11px] text-fg-2">earned / taken / left</span></th>)}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const rows = byEmployee.get(String(p._id)) ?? []
                  const accrues = rows[0]?.accrues ?? false
                  return (
                    <tr key={String(p._id)} className={TABLE.row}>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={p.fullName} size="xs" />
                          <span className="min-w-0">
                            <Link href={`/app/hr/people/${p._id}?tab=leave`} className="block truncate text-white transition-colors hover:text-blush">{p.fullName}</Link>
                            <span className="block text-[11px] text-fg-2">{p.code}{accrues ? '' : ' · does not accrue'}</span>
                          </span>
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-[#979797] md:table-cell">{p.departmentId ? (deptName.get(String(p.departmentId)) ?? '—') : '—'}</td>
                      {types.map((t) => {
                        const b = rows.find((r) => r.typeId === t.id)
                        if (!b || b.remaining === null) return <td key={t.id} className="px-4 py-2.5 text-right text-fg-3">—</td>
                        return (
                          <td key={t.id} className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                            <span className="text-[#979797]">{Math.round((b.opening + b.accrued + b.adjusted) * 100) / 100} / {b.taken} / </span>
                            <span className={b.remaining < 0 ? 'font-semibold text-[#FF6A66]' : 'font-semibold text-white'}>{b.remaining}</span>
                            {b.pending ? <span className={cn('block text-[11px]', TONE_TEXT.warning)}>{b.pending} pending</span> : null}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ListCard>
      ) : (
        <EmptyState className="card-solid rounded-[12px]" icon={<Scale />} title={people.length ? 'No earned leave types yet' : 'No one to show'} description={people.length ? 'Add Paid Leave and Sick Leave in HR settings to start accruing.' : 'People in the directory appear here with their balances.'} action={people.length && ctx.can('hr.settings') ? <Button variant="primary" href="/app/hr/settings?tab=leave">Set up leave types</Button> : undefined} />
      )}
    </>
  )
}
