import Link from 'next/link'
import { TriangleAlert, Users } from 'lucide-react'
import { buildHref, type SearchParams } from '@/lib/list'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { TABLE } from '../ui/list-card'
import { HoldControls } from './entry-controls'

export type RegisterEntry = {
  id: string
  employeeId: string
  name: string
  code: string
  payableDays: number
  workingDays: number
  lopDays: number
  earned: number
  deductions: number
  reimbursement: number
  net: number
  status: string
  warnings: number
  adjustments: number
}

const STATUS = { ready: { tone: 'success', label: 'Ready' }, on_hold: { tone: 'warning', label: 'On hold' }, excluded: { tone: 'neutral', label: 'Excluded' } } as const

/** The salary register: one row per person, with hold controls before lock. Server-rendered. */
export function Register({ rows, base, sp, cycleId, editable, selected, emptyHint }: { rows: RegisterEntry[]; base: string; sp: SearchParams; cycleId: string; editable: boolean; selected?: string; emptyHint: string }) {
  if (!rows.length) {
    return <EmptyState compact icon={<Users />} title={sp.q ? `Nobody matches "${sp.q}"` : 'Payroll has not been generated for this month'} description={sp.q ? undefined : emptyHint} />
  }
  return (
    <div className="overflow-x-auto">
      <table className={TABLE.table}>
        <thead>
          <tr className={TABLE.headRow}>
            <th className={TABLE.th}>Employee</th>
            <th className={TABLE.th}>Days paid</th>
            <th className={cn(TABLE.th, 'hidden text-right md:table-cell')}>LOP</th>
            <th className={cn(TABLE.th, 'text-right')}>Earned</th>
            <th className={cn(TABLE.th, 'hidden text-right md:table-cell')}>Deductions</th>
            <th className={cn(TABLE.th, 'hidden text-right lg:table-cell')}>Claims</th>
            <th className={cn(TABLE.th, 'text-right')}>Net</th>
            <th className={TABLE.th}>Status</th>
            <th className={TABLE.th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn(TABLE.row, selected === r.id && 'bg-white/[0.06] shadow-[inset_2px_0_0_rgba(255,255,255,0.6)]')}>
              <td className="px-4 py-2.5">
                <Link href={buildHref(base, sp, { entry: r.id })} scroll={false} aria-current={selected === r.id ? 'true' : undefined} className="text-white transition-colors hover:text-blush">
                  {r.name}
                </Link>
                <p className="flex items-center gap-1.5 whitespace-nowrap text-xs text-fg-2">
                  {r.code}
                  {r.warnings ? <TriangleAlert className="size-3 text-warning" aria-label={`${r.warnings} warning(s)`} /> : null}
                  {r.adjustments ? <span>· {r.adjustments} adjustment{r.adjustments === 1 ? '' : 's'}</span> : null}
                </p>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                <span className="text-white">{r.payableDays}</span>
                <span className="text-[#979797]"> of {r.workingDays}</span>
              </td>
              <td className={cn('hidden px-4 py-2.5 text-right tabular-nums md:table-cell', r.lopDays > 0 ? 'text-[#FF6A66]' : 'text-fg-3')}>{r.lopDays}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-white">{formatINR(r.earned)}</td>
              <td className="hidden px-4 py-2.5 text-right tabular-nums text-[#979797] md:table-cell">{formatINR(r.deductions)}</td>
              <td className="hidden px-4 py-2.5 text-right tabular-nums text-[#979797] lg:table-cell">{r.reimbursement ? formatINR(r.reimbursement) : '—'}</td>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-white">{formatINR(r.net)}</td>
              <td className="px-4 py-2.5">
                <Badge tone={STATUS[r.status as keyof typeof STATUS]?.tone ?? 'neutral'}>
                  {STATUS[r.status as keyof typeof STATUS]?.label ?? r.status}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-right">{editable ? <HoldControls cycleId={cycleId} employeeId={r.employeeId} name={r.name} status={r.status} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
