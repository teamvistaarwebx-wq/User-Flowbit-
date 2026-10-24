import { ChartPie, Table2 } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { formatINR, formatNumber } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { ColumnKind, ReportCell, ReportTable } from '@/modules/folio/queries/report-types'
import { TableCard, Td, Th, TBODY_ROW, TFOOT_ROW, THEAD_ROW } from '@/components/folio/ui'

const RIGHT: ColumnKind[] = ['money', 'number', 'percent']

function show(kind: ColumnKind, value: ReportCell): string {
  if (value === null || value === '') return '—'
  if (typeof value === 'number') {
    if (kind === 'money') return formatINR(value)
    if (kind === 'percent') return `${value}%`
    return formatNumber(value, Number.isInteger(value) ? 0 : 3)
  }
  return kind === 'date' ? formatDate(value) : value
}

/** Renders any Folio report table (same rows the CSV export writes), on the "Assign to me" table card. */
export function ReportTableView({ table, warnAt }: { table: ReportTable; warnAt?: number }) {
  const flagged = new Set(table.flagged ?? [])
  return (
    <TableCard icon={<Table2 />} title={table.title} subtitle={table.rows.length ? `${table.period} · ${table.rows.length} ${table.rows.length === 1 ? 'row' : 'rows'}` : table.period}>
      {!table.rows.length ? (
        <div className="border-t border-line">
          <EmptyState icon={<ChartPie />} title={table.empty} compact />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                {table.columns.map((c) => (
                  <Th key={c.header} align={RIGHT.includes(c.kind) ? 'right' : 'left'}>{c.header}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr aria-hidden className="h-1.5" />
              {table.rows.map((row, i) => (
                <tr key={i} className={TBODY_ROW}>
                  {row.map((cell, j) => {
                    const kind = table.columns[j]?.kind ?? 'text'
                    const negative = typeof cell === 'number' && cell < 0
                    return (
                      <Td key={j} align={RIGHT.includes(kind) ? 'right' : 'left'} className={cn('whitespace-nowrap', RIGHT.includes(kind) && 'tabular-nums', j === 0 ? 'text-white' : 'text-white/75', kind === 'date' && 'text-[#979797]', negative && 'text-[#FF6A66]')}>
                        {show(kind, cell)}
                        {kind === 'percent' && flagged.has(i) ? <Badge tone="warning" className="ml-2">≥ {warnAt ?? 30}% of revenue</Badge> : null}
                      </Td>
                    )
                  })}
                </tr>
              ))}
              <tr aria-hidden className="h-1.5" />
            </tbody>
            {table.totals ? (
              <tfoot>
                <tr className={TFOOT_ROW}>
                  {table.totals.map((cell, j) => {
                    const kind = table.columns[j]?.kind ?? 'text'
                    return (
                      <Td key={j} align={RIGHT.includes(kind) ? 'right' : 'left'} className={cn('whitespace-nowrap py-3 font-semibold', RIGHT.includes(kind) && 'tabular-nums')}>
                        {cell === null ? '' : show(kind, cell)}
                      </Td>
                    )
                  })}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </TableCard>
  )
}
