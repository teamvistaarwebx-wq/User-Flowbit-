'use client'

import { useState } from 'react'
import { Mail, RefreshCw, Repeat } from 'lucide-react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { cancelPendingChange, cancelSubscription, emailInvoiceAgain, simulateRenewal } from '@/modules/subscription/plan-actions'
import type { PriceOverrides } from '@/lib/plans'
import { PlanPicker, type ActivePlan, type PickerInitial } from './plan-picker'

export function CancelSubscriptionButton({ until }: { until: string }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="ghost">Cancel subscription</Button>}
      title="Cancel your subscription?"
      description={`You keep full access until ${until}. After that the workspace becomes read-only for 30 days, then locked; its data is deleted 90 days after that unless you choose a plan.`}
      confirmLabel="Cancel subscription"
      cancelLabel="Keep my plan"
      reason={{ label: 'Type CANCEL to confirm', placeholder: 'CANCEL', required: true }}
      onConfirm={(confirm) => cancelSubscription({ confirm: confirm ?? '' })}
    />
  )
}

export function CancelChangeButton() {
  const [run, pending] = useAction(cancelPendingChange)
  return (
    <Button size="sm" variant="secondary" loading={pending} onClick={() => run({})}>
      Cancel change
    </Button>
  )
}

export function SimulateRenewalButton({ label = 'Simulate renewal' }: { label?: string }) {
  const [run, pending] = useAction(simulateRenewal)
  return (
    <Button variant="ghost" loading={pending} icon={<RefreshCw className="size-4" />} onClick={() => run({})}>
      {label}
    </Button>
  )
}

export function EmailInvoiceButton({ id }: { id: string }) {
  const [run, pending] = useAction(emailInvoiceAgain)
  return (
    <Button size="sm" variant="ghost" loading={pending} icon={<Mail className="size-3.5" />} onClick={() => run({ id })}>
      Email again
    </Button>
  )
}

type PickerProps = { initial: PickerInitial; defaults: { work: number; employees: number; orbit: number; suiteSeats: number }; persons: number; testMode: boolean; paymentsOff?: boolean; supplierState: string | null; supplierGstin: string | null; billingState: string | null; active: ActivePlan; prices?: PriceOverrides; hideMuster?: boolean }

/** "Change plan" for an active subscription: the picker in a large dialog. */
export function ChangePlanDialog(props: PickerProps & { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(props.defaultOpen))
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="xl"
      title="Change plan"
      description="More seats or products apply now with a prorated charge. Fewer seats, removed products and cycle changes start at your next renewal."
      trigger={<Button variant="primary" icon={<Repeat className="size-4" />}>Change plan</Button>}
    >
      <PlanPicker {...props} onDone={() => setOpen(false)} />
    </Dialog>
  )
}
