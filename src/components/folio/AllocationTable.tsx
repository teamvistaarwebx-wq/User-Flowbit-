'use client'

import { ListOrdered, Wallet } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { formatINR, paiseToRupees, rupeesToPaise } from '@/lib/money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFieldError } from '@/components/ui/action-form'
import { spendOldestFirst } from '@/modules/folio/receipts/rules'
import { INSET, Note, PanelHeader } from './ui'

export type AllocationRow = { invoiceId: string; number: string; dueDate: string; owedPaise: number; tdsLeftPaise: number }
export type AllocationValue = { amount: string; tds: string }
export type AllocationValues = Record<string, AllocationValue>

const toInput = (paise: number) => (paise > 0 ? String(paiseToRupees(paise)) : '')
export const valuePaise = (v: string | undefined) => (v ? Math.max(0, rupeesToPaise(v)) : 0)
export const appliedOf = (values: AllocationValues) => Object.values(values).reduce((s, v) => s + valuePaise(v.amount), 0)

/**
 * "Apply oldest first": cash down the list, oldest due first. With TDS on, an
 * invoice the money fully covers also gets its expected TDS, so cash plus TDS
 * settles it; a part-covered invoice gets cash only.
 */
export function oldestFirst(rows: readonly AllocationRow[], receivedPaise: number, withTds: boolean): AllocationValues {
  const cashNeed = (r: AllocationRow) => r.owedPaise - (withTds ? Math.min(r.tdsLeftPaise, r.owedPaise) : 0)
  const spent = spendOldestFirst(rows.map((r) => ({ invoiceId: r.invoiceId, outstandingPaise: cashNeed(r), dueDate: r.dueDate, issueDate: r.dueDate })), receivedPaise)
  const cash = new Map(spent.map((s) => [s.invoiceId, s.amountPaise]))
  return Object.fromEntries(
    rows.map((r) => {
      const amount = cash.get(r.invoiceId) ?? 0
      const tds = withTds && amount > 0 && amount >= cashNeed(r) ? Math.min(r.tdsLeftPaise, r.owedPaise - amount) : 0
      return [r.invoiceId, { amount: toInput(amount), tds: toInput(tds) }]
    }),
  )
}

type AllocationTableProps = {
  rows: AllocationRow[]
  values: AllocationValues
  onChange: (next: AllocationValues) => void
  receivedPaise: number
  showTds: boolean
  today: string
  emptyText: string
}

function RowError({ name }: { name: string }) {
  const error = useFieldError(name)
  return error ? <p className="mt-1 text-xs text-[#FF6A66]">{error}</p> : null
}

/** The client's open invoices with an amount (and TDS) input per row; submits as allocations.N.*. */
export function AllocationTable({ rows, values, onChange, receivedPaise, showTds, today, emptyText }: AllocationTableProps) {
  const set = (id: string, patch: Partial<AllocationValue>) => onChange({ ...values, [id]: { amount: values[id]?.amount ?? '', tds: values[id]?.tds ?? '', ...patch } })

  if (!rows.length) return <p className={cn(INSET, 'px-4 py-8 text-center text-[13px] text-fg-2')}>{emptyText}</p>

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-2">Leave everything blank to hold it as an advance against future invoices.</p>
        <Button type="button" size="sm" variant="secondary" icon={<ListOrdered className="size-4" />} disabled={receivedPaise <= 0} onClick={() => onChange(oldestFirst(rows, receivedPaise, showTds))}>
          Apply oldest first
        </Button>
      </div>
      <ul className={cn(INSET, 'divide-y divide-white/[0.06]')}>
        {rows.map((r, i) => {
          const v = values[r.invoiceId] ?? { amount: '', tds: '' }
          const over = valuePaise(v.amount) + valuePaise(v.tds) > r.owedPaise
          const overdue = r.dueDate < today
          return (
            <li key={r.invoiceId} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_150px_auto] sm:items-center">
              <input type="hidden" name={`allocations.${i}.invoiceId`} value={r.invoiceId} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{r.number}</p>
                <p className={cn('text-xs', overdue ? 'text-[#FF6A66]' : 'text-fg-2')}>
                  Due {formatDate(r.dueDate)} · {formatINR(r.owedPaise)} owed{overdue ? ' · overdue' : ''}
                </p>
              </div>
              <div>
                <Input name={`allocations.${i}.amount`} inputMode="decimal" placeholder="Cash ₹" value={v.amount} onChange={(e) => set(r.invoiceId, { amount: e.target.value })} aria-invalid={over || undefined} inputSize="sm" />
                <RowError name={`allocations.${i}.amount`} />
              </div>
              {showTds ? (
                <Input name={`allocations.${i}.tds`} inputMode="decimal" placeholder="TDS ₹" value={v.tds} onChange={(e) => set(r.invoiceId, { tds: e.target.value })} aria-invalid={over || undefined} inputSize="sm" className="sm:w-28" />
              ) : (
                <span className="hidden sm:block" />
              )}
              {over ? <p className="text-xs text-[#FF6A66] sm:col-span-3">More than the {formatINR(r.owedPaise)} still owed on {r.number}.</p> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Aside: received vs applied, with the over-applied and advance-credit callouts. */
export function AllocationSummary({ receivedPaise, appliedPaise }: { receivedPaise: number; appliedPaise: number }) {
  const left = receivedPaise - appliedPaise
  return (
    <div className="space-y-3">
      <PanelHeader icon={<Wallet />} title="Allocation" />
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-white/75">Received</dt><dd className="tabular-nums text-white">{formatINR(receivedPaise)}</dd></div>
        <div className="flex justify-between"><dt className="text-white/75">Applied</dt><dd className="tabular-nums text-white">{formatINR(appliedPaise)}</dd></div>
        <div className="flex items-end justify-between border-t border-line pt-3">
          <dt className={left < 0 ? 'text-[#FF6A66]' : 'text-white/75'}>{left < 0 ? 'Over-applied' : 'Unapplied'}</dt>
          <dd className={cn('text-2xl font-semibold leading-8 tabular-nums', left < 0 ? 'text-[#FF6A66]' : left > 0 ? 'text-warning' : 'text-[#2DCBAF]')}>{formatINR(Math.abs(left))}</dd>
        </div>
      </dl>
      {left < 0 ? <Note tone="danger">You have applied more than the payment. Reduce an allocation.</Note> : null}
      {left > 0 && receivedPaise > 0 ? <Note>{formatINR(left)} will sit as unapplied credit on this client, ready for the next invoice.</Note> : null}
    </div>
  )
}
