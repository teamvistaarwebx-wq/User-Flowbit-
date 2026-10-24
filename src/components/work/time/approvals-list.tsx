'use client'

import { useState } from 'react'
import { Check, ChevronDown, ClipboardCheck, Undo2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { StatusPill } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useAction } from '@/components/ui/action-form'
import { WEEKDAY_SHORT, formatDate, formatDateTime, formatDuration, weekday } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { ApprovalSheet } from '@/modules/work/time/approvals'
import { approveWeeks, rejectWeek } from '@/modules/work/time/approval-actions'
import { weekDays, weekLabel } from '@/modules/work/time/week'
import { PanelHeader } from '../shared/table'

function SheetRow({ sheet, selected, onSelect }: { sheet: ApprovalSheet; selected: boolean; onSelect: (on: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [approve, approving] = useAction(approveWeeks)
  const pending = sheet.status === 'submitted'
  const byDay = (d: string) => sheet.entries.filter((e) => e.date === d).reduce((s, e) => s + e.minutes, 0)
  return (
    <li className={cn('rounded-[10px] transition-colors', selected ? 'bg-white/[0.06] shadow-[inset_2px_0_0_rgba(255,255,255,0.6)]' : 'hover:bg-white/[0.03]')}>
      <div className="flex min-h-14 flex-wrap items-center gap-3 px-3 py-2.5">
        {pending ? <Checkbox checked={selected} onCheckedChange={onSelect} disabled={sheet.isMine} aria-label={`Select ${sheet.member}`} /> : null}
        <Avatar name={sheet.member} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{sheet.member}</p>
          <p className="text-[13px] text-[#959596]">
            {weekLabel(sheet.weekStart)}
            {sheet.submittedAt ? ` · submitted ${formatDateTime(sheet.submittedAt)}` : ''}
            {sheet.decidedBy ? ` · by ${sheet.decidedBy}` : ''}
          </p>
        </div>
        <div className="text-right text-xs text-[#979797]">
          <span className="block text-sm font-semibold tabular-nums text-white">{formatDuration(sheet.total)}</span>
          {formatDuration(sheet.billable)} billable
        </div>
        <StatusPill status={sheet.status} />
        {pending && !sheet.isMine ? (
          <span className="flex items-center gap-2">
            <ConfirmDialog
              trigger={<Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />}>Send back</Button>}
              title={`Send back ${sheet.member}'s timesheet?`}
              description="They can edit the week and submit it again."
              confirmLabel="Send back"
              reason={{ label: 'Reason', placeholder: 'What needs fixing?', required: true }}
              onConfirm={async (reason) => {
                const res = await rejectWeek({ id: sheet.id, reason: reason ?? '' })
                // The dialog shows only `error`: say which rule the reason broke.
                return !res.ok && res.fieldErrors?.reason ? { ...res, error: res.fieldErrors.reason } : res
              }}
            />
            <Button size="sm" variant="violet" icon={<Check className="size-4" />} loading={approving} onClick={() => approve({ ids: [sheet.id] })}>
              Approve
            </Button>
          </span>
        ) : null}
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Show days" className="hit-area relative rounded-full p-2 text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-white">
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open ? (
        <div className="animate-fade-in space-y-3 px-3 pb-4">
          {sheet.reason ? <p className="rounded-lg bg-[#FF4540]/[0.1] px-3 py-2 text-[13px] text-white/85">Reason: {sheet.reason}</p> : null}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {weekDays(sheet.weekStart).map((d) => (
              <div key={d} className="rounded-[10px] bg-control p-2 text-center">
                <div className="text-xs text-[#929394]">{WEEKDAY_SHORT[weekday(d)]} {formatDate(d, { short: true })}</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums text-white">{byDay(d) ? formatDuration(byDay(d)) : '–'}</div>
              </div>
            ))}
          </div>
          <ul className="space-y-1 text-[13px]">
            {sheet.entries.map((e) => (
              <li key={e.id} className="flex min-h-8 items-center justify-between gap-3 rounded-lg px-2 transition-colors hover:bg-white/[0.04]">
                <span className="min-w-0 truncate text-[#979797]">
                  {formatDate(e.date, { short: true })} · <span className="text-white">{e.label}</span>
                  {e.note ? <span className="text-fg-3"> · {e.note}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-white">{formatDuration(e.minutes)}{e.billable ? <span className="ml-1 text-xs text-[#2DCBAF]">₹</span> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  )
}

export function ApprovalsList({ sheets, tab }: { sheets: ApprovalSheet[]; tab: string }) {
  const [picked, setSelected] = useState<string[]>([])
  const [approveAll, pending] = useAction(approveWeeks, { onDone: () => setSelected([]) })
  // Weeks decided from their own row (or by someone else) drop out of the selection.
  const selected = picked.filter((id) => sheets.some((s) => s.id === id && s.status === 'submitted'))
  if (!sheets.length) {
    return (
      <div className="card-solid">
        <EmptyState icon={<ClipboardCheck />} title={tab === 'submitted' ? 'No timesheets waiting for you' : `No ${tab} timesheets yet`} description="Submitted weeks from your team show up here." />
      </div>
    )
  }
  return (
    <section aria-label="Timesheets" className="card-table overflow-hidden">
      <PanelHeader
        icon={<ClipboardCheck />}
        title="Timesheets"
        subtitle={tab === 'submitted' ? (selected.length ? `${selected.length} selected` : 'Select weeks to approve them together') : `${sheets.length} ${sheets.length === 1 ? 'week' : 'weeks'}`}
        className="border-b border-line px-[23px] pb-4 pt-[17px]"
        actions={tab === 'submitted' ? (
          <Button size="sm" variant="primary" icon={<Check className="size-4" />} disabled={!selected.length} loading={pending} onClick={() => approveAll({ ids: selected })}>
            Approve selected
          </Button>
        ) : undefined}
      />
      <ul className="space-y-0.5 px-2.5 py-2">
        {sheets.map((s) => (
          <SheetRow key={s.id} sheet={s} selected={selected.includes(s.id)} onSelect={(on) => setSelected(on ? [...selected, s.id] : selected.filter((x) => x !== s.id))} />
        ))}
      </ul>
    </section>
  )
}
