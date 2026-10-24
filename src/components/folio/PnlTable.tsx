import { Table2 } from 'lucide-react'
import { formatMonth } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { PnlRow } from '@/modules/folio/pnl/pnl-math'
import { TableCard } from './ui'

const STRONG: PnlRow['kind'][] = ['net_income', 'total_costs', 'net']

/** The sticky first column has to be opaque: it takes the left end of the table card's gradient. */
const STICKY = 'sticky left-0 z-10 bg-[#282829]'
/** Same, for the totals rows, which carry a white 3% lift. */
const STICKY_STRONG = 'sticky left-0 z-10 bg-[#2E2E2F]'

/** Months across, lines down: income, each expense category, salaries, totals and net profit. */
export function PnlTable({ months, rows }: { months: string[]; rows: PnlRow[] }) {
  const firstCost = rows.findIndex((r) => r.kind === 'expense' || r.kind === 'salaries' || r.kind === 'total_costs')
  return (
    <TableCard icon={<Table2 />} title="Month by month" subtitle="Income, every cost line, totals and net profit">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-line">
              <th scope="col" className={cn(STICKY, 'h-[33px] pl-[23px] pr-4 text-left text-sm font-normal text-white')}>Line</th>
              {months.map((m) => (
                <th key={m} scope="col" className="h-[33px] whitespace-nowrap px-4 text-right text-sm font-normal text-white">
                  {formatMonth(m).replace(/^(\w{3})\w*/, '$1')}
                </th>
              ))}
              <th scope="col" className="h-[33px] whitespace-nowrap pl-4 pr-[23px] text-right text-sm font-normal text-white">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const strong = STRONG.includes(r.kind)
              return (
                <tr key={r.key} className={cn('transition-colors hover:bg-white/[0.04]', strong && 'bg-white/[0.03]', i === firstCost && 'border-t border-line')}>
                  <td className={cn(strong ? STICKY_STRONG : STICKY, 'whitespace-nowrap py-2.5 pr-4', strong ? 'pl-[23px] font-semibold text-white' : r.kind === 'expense' || r.kind === 'credit' ? 'pl-[39px] text-white/70' : 'pl-[23px] text-white')}>{r.label}</td>
                  {[...r.values, r.total].map((v, j) => (
                    <td
                      key={j}
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-right tabular-nums last:pr-[23px]',
                        strong ? 'font-semibold text-white' : 'text-white/75',
                        v < 0 && (r.kind === 'net' || r.kind === 'net_income') && 'text-[#FF6A66]',
                        v === 0 && !strong && 'text-fg-3',
                      )}
                    >
                      {v === 0 && !strong ? '—' : formatINR(v, { decimals: 0 })}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </TableCard>
  )
}
