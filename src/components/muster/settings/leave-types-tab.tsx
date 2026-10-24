'use client'

import { CalendarHeart, ListPlus, Pencil, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, NativeSelect } from '@/components/ui/input'
import { ACCRUAL_LABEL, ACCRUAL_MODELS, type AccrualModel } from '@/modules/muster/leave/accrual'
import { loadStandardLeaveTypes, saveLeaveType, setLeaveTypeActive } from '@/modules/muster/settings/rule-actions'
import { cn } from '@/lib/utils'
import { TONE_TEXT } from '@/components/ui/badge'
import { ListCard, TABLE } from '../ui/list-card'

export type LeaveTypeRow = {
  id: string
  code: string
  name: string
  isPaid: boolean
  accrualModel: AccrualModel
  annualQuota: number
  accrualPerMonth: number
  carryForwardCap: number | null
  proofRequiredAfterDays: number | null
  allowHalfDay: boolean
  requiresProof: boolean
  displayOrder: number
  isActive: boolean
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))

function LeaveTypeDialog({ row, trigger }: { row?: LeaveTypeRow; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} trigger={trigger} size="lg" title={row ? `Edit ${row.name}` : 'Add a leave type'} description="Blank carry-forward cap means no ceiling; 0 means it lapses at year end.">
      <ActionForm action={saveLeaveType} onDone={() => setOpen(false)} resetOnSuccess={!row} className="grid gap-4 sm:grid-cols-2">
        {row ? <input type="hidden" name="id" value={row.id} /> : null}
        <FormField name="code" label="Code" required><Input id="code" name="code" defaultValue={row?.code} placeholder="PL" className="uppercase" /></FormField>
        <FormField name="name" label="Name" required><Input id="name" name="name" defaultValue={row?.name} placeholder="Paid Leave" /></FormField>
        <FormField name="accrualModel" label="How it is earned" required>
          <NativeSelect id="accrualModel" name="accrualModel" defaultValue={row?.accrualModel ?? 'monthly'} options={ACCRUAL_MODELS.map((m) => ({ value: m, label: ACCRUAL_LABEL[m] }))} />
        </FormField>
        <FormField name="annualQuota" label="Days per year" help="On-application types: most days per request"><Input id="annualQuota" name="annualQuota" inputMode="decimal" defaultValue={num(row?.annualQuota ?? 12)} /></FormField>
        <FormField name="accrualPerMonth" label="Days per month" help="For monthly accrual"><Input id="accrualPerMonth" name="accrualPerMonth" inputMode="decimal" defaultValue={num(row?.accrualPerMonth ?? 1)} /></FormField>
        <FormField name="carryForwardCap" label="Carry-forward cap (days)"><Input id="carryForwardCap" name="carryForwardCap" inputMode="numeric" defaultValue={num(row?.carryForwardCap)} /></FormField>
        <FormField name="proofRequiredAfterDays" label="Proof needed beyond (days)" help="Blank: never; 0: always"><Input id="proofRequiredAfterDays" name="proofRequiredAfterDays" inputMode="numeric" defaultValue={num(row?.proofRequiredAfterDays)} /></FormField>
        <FormField name="displayOrder" label="Order"><Input id="displayOrder" name="displayOrder" inputMode="numeric" defaultValue={num(row?.displayOrder ?? 100)} /></FormField>
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
          <Checkbox name="isPaid" defaultChecked={row?.isPaid ?? true} label="Paid" />
          <Checkbox name="allowHalfDay" defaultChecked={row?.allowHalfDay ?? true} label="Half days allowed" />
          <Checkbox name="requiresProof" defaultChecked={row?.requiresProof} label="Always needs proof" />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton>{row ? 'Save' : 'Add leave type'}</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

/** Leave types: add, edit, retire/restore and load the standard Indian set. */
export function LeaveTypesTab({ rows, canWrite }: { rows: LeaveTypeRow[]; canWrite: boolean }) {
  const [loadStandard, loading] = useAction(loadStandardLeaveTypes)
  const [toggle, toggling] = useAction(setLeaveTypeActive)
  return (
    <ListCard
      label="Leave types"
      icon={<CalendarHeart />}
      description="What people can apply for, and how each kind is earned."
      actions={canWrite ? (
        <>
          <Button size="sm" variant="secondary" icon={<ListPlus className="size-4" />} loading={loading} onClick={() => loadStandard({})}>Load the standard set</Button>
          <LeaveTypeDialog trigger={<Button size="sm" variant="violet" icon={<Plus className="size-4" />}>Add leave type</Button>} />
        </>
      ) : null}
    >
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className={TABLE.table}>
            <thead>
              <tr className={TABLE.headRow}>
                <th className={cn(TABLE.th, 'pl-5 sm:pl-[23px]')}>Type</th><th className={cn(TABLE.th, 'px-3')}>Earned</th><th className={cn(TABLE.th, 'px-3 text-right')}>Days/yr</th><th className={cn(TABLE.th, 'px-3 text-right')}>Per month</th><th className={cn(TABLE.th, 'px-3 text-right')}>Carry cap</th><th className={cn(TABLE.th, 'px-3')}>Rules</th><th className={TABLE.th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn(TABLE.row, !r.isActive && 'opacity-50')}>
                  <td className="py-2.5 pl-5 pr-3 sm:pl-[23px]"><span className="text-white">{r.name}</span> <span className="ml-1 font-mono text-xs text-fg-2">{r.code}</span></td>
                  <td className="px-3 py-2.5 text-[#979797]">{ACCRUAL_LABEL[r.accrualModel]}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-white/85">{r.annualQuota}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-white/85">{r.accrualModel === 'monthly' ? r.accrualPerMonth : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-white/85">{r.carryForwardCap === null ? 'No cap' : r.carryForwardCap === 0 ? 'Lapses' : r.carryForwardCap}</td>
                  <td className="px-3 py-2.5 text-[13px]">
                    {/* Rules as words, the paid/unpaid word in its colour: three pills a row was noise. */}
                    <span className={r.isPaid ? TONE_TEXT.success : TONE_TEXT.danger}>{r.isPaid ? 'Paid' : 'Unpaid'}</span>
                    {r.allowHalfDay ? <span className="text-[#979797]"> · Half day</span> : null}
                    {r.requiresProof || r.proofRequiredAfterDays !== null ? <span className="text-[#979797]"> · {r.requiresProof || r.proofRequiredAfterDays === 0 ? 'Proof' : `Proof > ${r.proofRequiredAfterDays}d`}</span> : null}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {canWrite ? (
                      <span className="inline-flex items-center gap-1">
                        <LeaveTypeDialog row={r} trigger={<IconButton label={`Edit ${r.name}`}><Pencil className="size-4" /></IconButton>} />
                        <Button size="sm" variant="ghost" loading={toggling} onClick={() => toggle({ id: r.id, active: !r.isActive })}>{r.isActive ? 'Retire' : 'Restore'}</Button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact icon={<CalendarHeart />} title="No leave types yet" description="Load the standard set (PL, SL, comp-off, maternity, paternity, LWP) or add your own." />
      )}
    </ListCard>
  )
}
