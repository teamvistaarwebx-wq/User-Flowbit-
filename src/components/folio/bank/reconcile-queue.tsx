'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, Check, EyeOff, RotateCcw, Undo2 } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, NativeSelect } from '@/components/ui/input'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { confirmMatchAction, expenseFromTxnAction, ignoreTxnAction, undoStatementAction } from '@/modules/folio/bank/actions'
import type { MatchSuggestion } from '@/modules/folio/bank/match'
import type { CreditRow, DebitRow, InvoiceOption, ResolvedRow, StatementRow } from '@/modules/folio/bank/queue'
import { SplitDepositDialog, SplitSuggestionRow } from './split-deposit'

const TONE = { high: 'success', medium: 'warning', low: 'neutral' } as const
const CONFIDENCE = { high: 'High', medium: 'Medium', low: 'Low' } as const

function IgnoreButton({ txnId, ignored = false }: { txnId: string; ignored?: boolean }) {
  const [run, pending] = useAction(ignoreTxnAction)
  return (
    <Button size="sm" variant="ghost" loading={pending} icon={ignored ? <RotateCcw className="size-3.5" /> : <EyeOff className="size-3.5" />} onClick={() => run({ txnId, ignored: !ignored })}>
      {ignored ? 'Back to queue' : 'Ignore'}
    </Button>
  )
}

function SuggestionRow({ txnId, s }: { txnId: string; s: MatchSuggestion }) {
  const [run, pending] = useAction(confirmMatchAction)
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[8px] bg-white/[0.03] px-3 py-2">
      <Badge tone={TONE[s.confidence]}>{CONFIDENCE[s.confidence]} · {s.score}</Badge>
      <span className="min-w-0 flex-1 text-sm text-white">
        {s.number} · {s.clientName}
        <span className="block text-xs text-fg-2">
          Balance {formatINR(s.balancePaise)}{s.tdsPaise ? ` · TDS ${formatINR(s.tdsPaise)}` : ''} · {s.reasons.join(' · ')}
        </span>
      </span>
      <Button size="sm" loading={pending} icon={<Check className="size-3.5" />} onClick={() => run({ txnId, invoiceId: s.invoiceId, amountPaise: s.amountPaise, tdsPaise: s.tdsPaise, score: s.score })}>
        Confirm
      </Button>
    </li>
  )
}

/** Any open invoice of the same entity, for a credit nothing matched well. */
function ManualMatch({ row, invoices }: { row: CreditRow; invoices: InvoiceOption[] }) {
  const [invoiceId, setInvoiceId] = useState('')
  const [run, pending] = useAction(confirmMatchAction)
  const options = invoices.filter((i) => i.entityId === row.entityId)
  if (!options.length) return null
  const picked = options.find((i) => i.id === invoiceId)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect aria-label="Pick an invoice" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} options={options.map((i) => ({ value: i.id, label: `${i.label} · ${formatINR(i.balancePaise)}` }))} placeholder="Pick another invoice" className="h-9 min-w-0 max-w-full flex-1 text-xs sm:max-w-[340px]" />
      <Button size="sm" variant="secondary" disabled={!picked} loading={pending} onClick={() => picked && run({ txnId: row.id, invoiceId: picked.id, amountPaise: Math.min(row.amountPaise, picked.balancePaise), tdsPaise: 0, score: null })}>
        Record receipt
      </Button>
    </div>
  )
}

export function CreditQueue({ rows, invoices }: { rows: CreditRow[]; invoices: InvoiceOption[] }) {
  if (!rows.length) return <EmptyState compact icon={<ArrowDownLeft />} title="No money in waiting" description="Import a statement; deposits that are not matched yet appear here." />
  return (
    <ul className="divide-y divide-white/[0.06]">
      {rows.map((row) => (
        <li key={row.id} className="space-y-2 px-4 py-3 sm:px-[23px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="min-w-0 flex-1 text-sm text-white/85">
              <span className="text-fg-2">{formatDate(row.date)}</span> · <span className="break-words">{row.narration}</span>
            </span>
            <span className="font-semibold tabular-nums text-mint">+{formatINR(row.amountPaise)}</span>
          </div>
          {row.suggestions.length || row.splits.length ? (
            <ul className="space-y-1.5">
              {row.splits.map((s) => <SplitSuggestionRow key={s.invoices.map((i) => i.invoiceId).join('+')} txnId={row.id} split={s} />)}
              {row.suggestions.map((s) => <SuggestionRow key={s.invoiceId} txnId={row.id} s={s} />)}
            </ul>
          ) : (
            <p className="text-xs text-fg-2">No open invoice looks like this payment.</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ManualMatch row={row} invoices={invoices} />
            <span className="flex flex-wrap items-center gap-1">
              <SplitDepositDialog row={row} invoices={invoices} />
              <IgnoreButton txnId={row.id} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function DebitItem({ row, categories }: { row: DebitRow; categories: { id: string; name: string }[] }) {
  const [categoryId, setCategoryId] = useState(row.categoryId ?? '')
  const [vendor, setVendor] = useState(row.payee)
  const [run, pending] = useAction(expenseFromTxnAction)
  return (
    <li className="space-y-2 px-4 py-3 sm:px-[23px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 text-sm text-white/85">
          <span className="text-fg-2">{formatDate(row.date)}</span> · <span className="break-words">{row.narration}</span>
        </span>
        <span className="font-semibold tabular-nums text-white">−{formatINR(row.amountPaise)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Paid to" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} className="h-9 min-w-0 flex-1 text-xs sm:max-w-[220px]" />
        <NativeSelect aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="Category" className="h-9 min-w-0 flex-1 text-xs sm:max-w-[220px]" />
        <Button size="sm" variant="secondary" disabled={!categoryId} loading={pending} onClick={() => run({ txnId: row.id, categoryId, vendor })}>
          Book expense
        </Button>
        <IgnoreButton txnId={row.id} />
      </div>
    </li>
  )
}

export function DebitQueue({ rows, categories, canExpense }: { rows: DebitRow[]; categories: { id: string; name: string }[]; canExpense: boolean }) {
  if (!rows.length) return <EmptyState compact icon={<ArrowUpRight />} title="No money out waiting" description="Withdrawals you have not booked or ignored appear here." />
  if (!canExpense) return <p className="px-4 py-4 text-sm text-fg-2 sm:px-[23px]">{rows.length} withdrawals wait. Booking them as expenses needs the expenses permission.</p>
  return <ul className="divide-y divide-white/[0.06]">{rows.map((row) => <DebitItem key={row.id} row={row} categories={categories} />)}</ul>
}

const RESOLVED_LABEL: Record<string, string> = { matched: 'Receipt', expense: 'Expense', ignored: 'Ignored' }

export function ResolvedList({ rows }: { rows: ResolvedRow[] }) {
  if (!rows.length) return <p className="px-4 py-4 text-sm text-fg-2 sm:px-[23px]">Nothing decided yet.</p>
  return (
    <ul className="divide-y divide-white/[0.06]">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm sm:px-[23px]">
          <span className="text-fg-2">{formatDate(r.date)}</span>
          <span className="min-w-0 flex-1 truncate text-white/85" title={r.narration}>{r.narration}</span>
          <span className="tabular-nums text-white">{r.direction === 'credit' ? '+' : '−'}{formatINR(r.amountPaise)}</span>
          {r.receiptId ? <Link href={`/app/folio/receipts/${r.receiptId}`} className="text-xs text-link hover:underline">{RESOLVED_LABEL[r.status]}</Link> : r.expenseId ? <Link href={`/app/folio/expenses/${r.expenseId}`} className="text-xs text-link hover:underline">{RESOLVED_LABEL[r.status]}</Link> : <Badge tone="neutral">{RESOLVED_LABEL[r.status] ?? r.status}</Badge>}
          {r.status === 'ignored' ? <IgnoreButton txnId={r.id} ignored /> : null}
        </li>
      ))}
    </ul>
  )
}

export function StatementList({ rows }: { rows: StatementRow[] }) {
  if (!rows.length) return <p className="px-4 py-4 text-sm text-fg-2 sm:px-[23px]">No statements imported yet.</p>
  return (
    <ul className="divide-y divide-white/[0.06]">
      {rows.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm sm:px-[23px]">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-white">{s.fileName || 'Statement'}</span>
            <span className="block text-xs text-fg-2">{s.range} · {s.imported} rows{s.duplicates ? `, ${s.duplicates} skipped` : ''} · {s.by}</span>
          </span>
          {s.status === 'undone' ? (
            <Badge tone="neutral">Undone</Badge>
          ) : s.canUndo ? (
            <ConfirmDialog
              trigger={<Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />}>Undo</Button>}
              title="Undo this statement?"
              description="Its rows are removed, receipts made from them are cancelled (the invoices are owed again) and expenses booked from them are deleted."
              confirmLabel="Undo import"
              onConfirm={() => undoStatementAction({ statementId: s.id })}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
