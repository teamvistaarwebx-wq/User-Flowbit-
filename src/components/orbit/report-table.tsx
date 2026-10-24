'use client'

import Papa from 'papaparse'
import { PAPA_SAFE } from '@/lib/csv-safe'
import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { TBODY_ROW, THEAD_ROW, TableCard, Td, Th } from './parts'

export type ReportColumn = { key: string; header: string; align?: 'left' | 'right' }
export type ReportRow = { id: string; cells: Record<string, string | number>; highlight?: string[]; tag?: string }

function download(name: string, columns: ReportColumn[], rows: ReportRow[]) {
  const csv = Papa.unparse({ fields: columns.map((c) => c.header), data: rows.map((r) => columns.map((c) => r.cells[c.key] ?? '')) }, PAPA_SAFE)
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** A report section as an "Assign to me" table card, with "Download CSV" (client-side, from the rows shown). */
export function ReportTable({ label, icon, hint, columns, rows, csvName, empty = 'Nothing in this period.' }: { label: string; icon: ReactNode; hint?: string; columns: ReportColumn[]; rows: ReportRow[]; csvName: string; empty?: string }) {
  return (
    <TableCard
      className="col-span-12"
      icon={icon}
      title={label}
      subtitle={hint}
      actions={rows.length ? <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => download(csvName, columns, rows)}>Download CSV</Button> : null}
    >
      {rows.length === 0 ? (
        <p className="border-t border-line px-[23px] py-8 text-center text-[13px] text-fg-2">{empty}</p>
      ) : (
        <div className="overflow-x-auto pb-3">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                {columns.map((c) => <Th key={c.key} align={c.align === 'right' ? 'right' : 'left'}>{c.header}</Th>)}
              </tr>
            </thead>
            <tbody>
              <tr aria-hidden className="h-1.5" />
              {rows.map((r) => (
                <tr key={r.id} className={cn(TBODY_ROW, 'h-8')}>
                  {columns.map((c, i) => (
                    <Td key={c.key} align={c.align === 'right' ? 'right' : 'left'} className={cn('tabular-nums', i === 0 ? 'text-white' : 'text-white/80', r.highlight?.includes(c.key) && 'font-semibold !text-[#2DCBAF]')}>
                      {r.cells[c.key]}
                      {i === 0 && r.tag ? <span className="ml-2 text-xs text-[#979797]">{r.tag}</span> : null}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableCard>
  )
}
