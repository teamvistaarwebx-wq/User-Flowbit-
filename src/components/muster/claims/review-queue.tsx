'use client'

import { CheckCheck, Paperclip, Send, Wallet } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { CLAIM_STATUS_LABELS, CLAIM_STATUS_TONES, type ClaimStatus } from '@/modules/muster/claims/constants'
import { bulkApproveClaims, markClaimsPaid, scheduleClaims } from '@/modules/muster/claims/review-actions'
import { useAction } from '@/components/ui/action-form'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ClaimDecision } from './claim-decision'

export type ClaimRow = {
  id: string
  employee: string
  code: string
  own: boolean
  expenseDate: string
  purpose: string
  vendor: string | null
  project: string | null
  category: string
  claimed: number
  approved: number | null
  status: ClaimStatus
  reviewNote: string | null
  receipts: number
  formName: string | null
  cycleLabel: string | null
}

/** Column header, as DataTable: 14/400 white on a 33px ruled row. */
const TH = 'h-[33px] whitespace-nowrap px-4 text-left text-sm font-normal text-white'

type Props = {
  rows: ClaimRow[]
  tab: string
  canReview: boolean
  canPay: boolean
  canSchedule: boolean
  cycles: { value: string; label: string }[]
  empty: ReactNode
  /** Card heading, as the dashboard's "Assign to me": an UPPERCASE label, a subtitle and controls at the right. */
  label?: ReactNode
  icon?: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

/** The claims table with review actions, bulk approve, scheduling into payroll and paying outside payroll. */
export function ReviewQueue({ rows, tab, canReview, canPay, canSchedule, cycles, empty, label, icon, description, actions }: Props) {
  const selectable = (tab === 'review' && canReview) || (tab === 'approved' && (canSchedule || canPay))
  const eligible = useMemo(() => rows.filter((r) => !r.own), [rows])
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const selected = eligible.filter((r) => !unticked.has(r.id)).map((r) => r.id)
  const [cycleId, setCycleId] = useState(cycles[0]?.value ?? '')
  const [reference, setReference] = useState('')
  const [approveAll, approving] = useAction(bulkApproveClaims)
  const [schedule, scheduling] = useAction(scheduleClaims)
  const [pay, paying] = useAction(markClaimsPaid)
  const total = rows.filter((r) => selected.includes(r.id)).reduce((s, r) => s + (r.approved ?? r.claimed), 0)

  const toggle = (id: string) =>
    setUnticked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <section className="card-table overflow-hidden animate-fade-in">
      {label ? (
        <header className="flex flex-col gap-3 px-5 pb-4 pt-[17px] sm:px-[23px] lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white [&_svg]:size-4 [&_svg]:shrink-0">
              {icon}
              {label}
            </h2>
            {description ? <p className="mt-1 text-[13px] text-[#959596]">{description}</p> : null}
          </div>
          {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
        </header>
      ) : null}
      {selectable && rows.length ? (
        <div className="flex flex-col gap-3 border-t border-line bg-white/[0.025] px-5 py-3 sm:px-[23px] lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-fg-2">
            <span className="font-semibold tabular-nums text-white">{selected.length}</span> of {eligible.length} ticked · <span className="tabular-nums text-white">{formatINR(total)}</span>
            {rows.length > eligible.length ? <span> · your own claims are left for someone else</span> : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {tab === 'review' ? (
              <Button size="sm" variant="primary" icon={<CheckCheck className="size-4" />} loading={approving} disabled={!selected.length} onClick={() => approveAll({ ids: selected })}>
                Approve ticked in full
              </Button>
            ) : null}
            {tab === 'approved' && canSchedule ? (
              cycles.length ? (
                <>
                  <Select size="sm" options={cycles} value={cycleId} onValueChange={setCycleId} aria-label="Payroll month" className="w-48" />
                  <Button size="sm" variant="primary" icon={<Send className="size-4" />} loading={scheduling} disabled={!selected.length || !cycleId} onClick={() => schedule({ cycleId, ids: selected })}>
                    Send to payroll
                  </Button>
                </>
              ) : (
                <span className="text-xs text-fg-2">Open a payroll month to send claims to payroll.</span>
              )
            ) : null}
            {tab === 'approved' && canPay ? (
              <>
                <Input inputSize="sm" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / UPI reference" className="w-44" aria-label="Payment reference" />
                <Button size="sm" variant="secondary" icon={<Wallet className="size-4" />} loading={paying} disabled={!selected.length || reference.trim().length < 2} onClick={() => pay({ ids: selected, paymentReference: reference })}>
                  Mark paid
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={cn('overflow-x-auto', (label || (selectable && rows.length)) && 'border-t border-line')}>
        <table className="w-full border-collapse text-[13px] max-sm:[&_td]:whitespace-nowrap">
          <thead>
            <tr className="border-b border-line">
              {selectable ? <th className={cn(TH, 'w-10')} /> : null}
              <th className={TH}>Employee</th>
              <th className={TH}>Expense</th>
              <th className={cn(TH, 'hidden md:table-cell')}>Category</th>
              <th className={cn(TH, 'text-right')}>Claimed</th>
              <th className={cn(TH, 'text-right')}>Approved</th>
              <th className={TH}>Status</th>
              <th className={cn(TH, 'text-right')}>{tab === 'review' && canReview ? 'Decide' : ''}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="align-top transition-colors duration-150 hover:bg-white/[0.04]">
                  {selectable ? (
                    <td className="px-4 py-3">
                      <input type="checkbox" aria-label={`Tick claim of ${r.employee}`} disabled={r.own} checked={!r.own && !unticked.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[#8E4C80]" />
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.employee} size="sm" />
                      <div className="min-w-0">
                        <p className="text-white">{r.employee}</p>
                        <p className="text-xs text-fg-2">{r.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white">{r.purpose}</p>
                    <p className="text-xs text-[#979797]">
                      {formatDate(r.expenseDate)}
                      {r.vendor ? ` · ${r.vendor}` : ''}
                      {r.project ? ` · ${r.project}` : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-1.5 text-xs">
                      {r.receipts ? (
                        <a href={`/api/muster/claims/${r.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link underline-offset-2 hover:underline">
                          <Paperclip className="size-3" /> Receipt
                        </a>
                      ) : (
                        <span className="text-fg-2">No receipt</span>
                      )}
                      {r.formName ? <span className="text-fg-2">· {r.formName}</span> : null}
                    </div>
                    {r.reviewNote ? <p className="mt-1 text-xs italic text-fg-2">“{r.reviewNote}”</p> : null}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">{r.category}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-white">{formatINR(r.claimed)}</td>
                  <td className={cn('px-4 py-3 text-right tabular-nums', r.approved != null && r.approved < r.claimed ? 'text-warning' : 'text-[#979797]')}>{r.approved == null ? '—' : formatINR(r.approved)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={CLAIM_STATUS_TONES[r.status]}>
                      {CLAIM_STATUS_LABELS[r.status]}
                    </Badge>
                    {r.cycleLabel ? <p className="mt-1 text-xs text-fg-2">{r.cycleLabel}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {tab === 'review' && canReview ? r.own ? <span className="text-xs text-fg-2">Your own claim</span> : <ClaimDecision id={r.id} employee={r.employee} claimed={r.claimed} purpose={r.purpose} /> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
