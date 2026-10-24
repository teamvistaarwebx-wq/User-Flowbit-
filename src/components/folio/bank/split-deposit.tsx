'use client'

import { useMemo, useState } from 'react'
import { Check, Split } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { formatINR } from '@/lib/money'
import { confirmSplitAction } from '@/modules/folio/bank/actions'
import type { SplitSuggestion } from '@/modules/folio/bank/match'
import type { CreditRow, InvoiceOption } from '@/modules/folio/bank/queue'
import { draftSplit, rupeesToPaise, splitTotals, type SplitLine } from '@/modules/folio/bank/split'

const paiseToText = (p: number) => (p ? (p / 100).toFixed(2).replace(/\.00$/, '') : '')

/** "Pays INV/1 + INV/2 exactly" with one Confirm: the deposit equals those balances. */
export function SplitSuggestionRow({ txnId, split }: { txnId: string; split: SplitSuggestion }) {
  const [run, pending] = useAction(confirmSplitAction)
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[8px] bg-white/[0.03] px-3 py-2">
      <Badge tone="success">Split · {split.invoices.length}</Badge>
      <span className="min-w-0 flex-1 text-sm text-white">
        {split.invoices.map((i) => i.number).join(' + ')} · {split.clientName}
        <span className="block text-xs text-fg-2">Pays these balances exactly ({formatINR(split.totalPaise)}){split.named ? ' · client named in the narration' : ''}</span>
      </span>
      <Button size="sm" loading={pending} icon={<Check className="size-3.5" />} onClick={() => run({ txnId, allocations: split.invoices.map((i) => ({ invoiceId: i.invoiceId, amountPaise: i.amountPaise, tdsPaise: 0 })), score: null })}>
        Confirm split
      </Button>
    </li>
  )
}

type Draft = Record<string, { amount: string; tds: string }>

const draftFor = (deposit: number, invoices: InvoiceOption[]): Draft =>
  Object.fromEntries(draftSplit(deposit, invoices).map((l) => [l.invoiceId, { amount: paiseToText(l.amountPaise), tds: '' }]))

/** Manual allocation: one deposit across any open invoices of one client, with TDS per invoice; the rest stays as advance. */
export function SplitDepositDialog({ row, invoices }: { row: CreditRow; invoices: InvoiceOption[] }) {
  const options = useMemo(() => invoices.filter((i) => i.entityId === row.entityId), [invoices, row.entityId])
  const clients = useMemo(() => [...new Map(options.map((i) => [i.clientId, i.clientName])).entries()].map(([value, label]) => ({ value, label })), [options])
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState(row.splits[0]?.clientId ?? clients[0]?.value ?? '')
  const forClient = useMemo(() => options.filter((i) => i.clientId === clientId).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [options, clientId])
  const [draft, setDraft] = useState<Draft>(() => draftFor(row.amountPaise, forClient))
  const [run, pending] = useAction(confirmSplitAction, { onDone: () => setOpen(false) })
  if (clients.length === 0) return null

  const lines: SplitLine[] = forClient.map((i) => ({ invoiceId: i.id, amountPaise: rupeesToPaise(draft[i.id]?.amount ?? ''), tdsPaise: rupeesToPaise(draft[i.id]?.tds ?? '') }))
  const unreadable = lines.some((l) => Number.isNaN(l.amountPaise) || Number.isNaN(l.tdsPaise))
  const totals = splitTotals(row.amountPaise, unreadable ? [] : lines, new Map(forClient.map((i) => [i.id, i.balancePaise])))
  const problem = unreadable ? 'Use amounts like 12500 or 12,500.50.' : totals.problem
  const pickClient = (next: string) => {
    setClientId(next)
    setDraft(draftFor(row.amountPaise, options.filter((i) => i.clientId === next)))
  }
  const set = (id: string, field: 'amount' | 'tds', value: string) => setDraft((cur) => ({ ...cur, [id]: { amount: cur[id]?.amount ?? '', tds: cur[id]?.tds ?? '', [field]: value } }))

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      trigger={<Button size="sm" variant="ghost" icon={<Split className="size-3.5" />}>Split across invoices</Button>}
      title={`Split ${formatINR(row.amountPaise)} across invoices`}
      description="One receipt with an amount (and any TDS) for each invoice of one client. Whatever is not allocated stays as advance credit."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-fg-2">
            Allocated <span className="tabular-nums text-white">{formatINR(totals.allocatedPaise)}</span> · advance <span className="tabular-nums text-white">{formatINR(totals.advancePaise)}</span>
          </span>
          <Button disabled={Boolean(problem)} loading={pending} onClick={() => run({ txnId: row.id, allocations: lines.filter((l) => l.amountPaise + l.tdsPaise > 0), score: null })}>
            Record receipt
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {clients.length > 1 ? <NativeSelect aria-label="Client" value={clientId} onChange={(e) => pickClient(e.target.value)} options={clients} className="h-9 text-sm" /> : <p className="text-sm text-white">{clients[0].label}</p>}
        <ul className="divide-y divide-white/[0.06] rounded-[10px] bg-white/[0.03]">
          {forClient.map((i) => (
            <li key={i.id} className="grid grid-cols-1 items-center gap-2 px-3 py-2.5 sm:grid-cols-[1fr_140px_110px]">
              <span className="min-w-0 text-sm text-white">
                {i.number}
                <span className="block text-xs text-fg-2">Balance {formatINR(i.balancePaise)} · due {i.dueDate}</span>
              </span>
              <Input aria-label={`Amount for ${i.number}`} inputMode="decimal" placeholder="Amount ₹" value={draft[i.id]?.amount ?? ''} onChange={(e) => set(i.id, 'amount', e.target.value)} className="h-9 text-sm tabular-nums" />
              <Input aria-label={`TDS for ${i.number}`} inputMode="decimal" placeholder="TDS ₹" value={draft[i.id]?.tds ?? ''} onChange={(e) => set(i.id, 'tds', e.target.value)} className="h-9 text-sm tabular-nums" />
            </li>
          ))}
        </ul>
        {problem ? <p role="alert" className="text-xs text-warning">{problem}</p> : null}
      </div>
    </Dialog>
  )
}
