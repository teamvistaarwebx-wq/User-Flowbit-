'use client'

import { CheckCircle2, FilePlus2, Pause, Pencil, Play, XCircle } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatINR } from '@/lib/money'
import { cancelPhase, raiseMilestoneInvoice, setPlanStatus } from '@/modules/folio/recurring/actions'
import { useRun } from './use-run'

/** Plan header actions: edit, hold/resume, mark completed, cancel. */
export function PlanActions({ id, status, canEdit }: { id: string; status: string; canEdit: boolean }) {
  const run = useRun()
  const [set, setting] = useAction(setPlanStatus)
  if (!canEdit) return null
  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'cancelled' ? <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} href={`/app/folio/recurring/plans/${id}?edit=1`}>Edit</Button> : null}
      {status === 'active' ? <Button size="sm" variant="ghost" icon={<Pause className="size-4" />} loading={setting} onClick={() => set({ id, status: 'on_hold' })}>Put on hold</Button> : null}
      {status === 'on_hold' || status === 'draft' ? <Button size="sm" variant="ghost" icon={<Play className="size-4" />} loading={setting} onClick={() => set({ id, status: 'active' })}>Make active</Button> : null}
      {status !== 'completed' && status !== 'cancelled' ? <Button size="sm" variant="ghost" icon={<CheckCircle2 className="size-4" />} loading={setting} onClick={() => set({ id, status: 'completed' })}>Mark completed</Button> : null}
      {status !== 'cancelled' && status !== 'completed' ? <ConfirmDialog trigger={<Button size="sm" variant="danger" icon={<XCircle className="size-4" />}>Cancel plan</Button>} title="Cancel this plan?" description="No more phases can be invoiced. Invoices already raised stay as they are." confirmLabel="Cancel plan" onConfirm={() => run(setPlanStatus({ id, status: 'cancelled' }))} /> : null}
    </div>
  )
}

/** Per-phase actions: raise the draft invoice, or cancel a phase not yet invoiced. */
export function PhaseActions({ planId, milestoneId, amountPaise, canRaise, canCancel }: { planId: string; milestoneId: string; amountPaise: number; canRaise: boolean; canCancel: boolean }) {
  const run = useRun()
  return (
    <div className="flex justify-end gap-1">
      {canRaise ? <ConfirmDialog trigger={<Button size="sm" variant="secondary" icon={<FilePlus2 className="size-4" />}>Raise invoice</Button>} title="Raise the invoice for this phase?" description={`Creates a draft for ${formatINR(amountPaise)} before tax. Review it before issuing.`} tone="primary" confirmLabel="Create draft" onConfirm={() => run(raiseMilestoneInvoice({ planId, milestoneId }))} /> : null}
      {canCancel ? <ConfirmDialog trigger={<Button size="sm" variant="ghost">Cancel phase</Button>} title="Cancel this phase?" description="It will not be invoiced. You can still edit the plan to add phases." confirmLabel="Cancel phase" onConfirm={() => run(cancelPhase({ planId, milestoneId }))} /> : null}
    </div>
  )
}
