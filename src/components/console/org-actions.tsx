'use client'

import { useState, type ReactNode } from 'react'
import { Ban, CalendarPlus, CircleCheck, CircleSlash, Repeat, RotateCcw, Settings2, Tags, TimerOff, XCircle } from 'lucide-react'
import type { ActionResult } from '@/lib/action-types'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL, type AccountType } from '@/lib/account-types'
import { cancelSubscriptionInvoice, changePlanManually, endTrialNow, extendTrial, restoreWorkspace, setAccountType, setAddOns, setSubscriptionStatus, setWorkspaceDisabled } from '@/modules/console/account-actions'
import { ADD_ONS, ADD_ON_LABEL } from '@/lib/addons'
import { extendDialogCopy, windowWords } from '@/lib/console/extension-copy'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = (input: FormData) => Promise<ActionResult<any>>

/** A button that opens a dialog with a form; every Console action on an account needs a reason. */
function ActionDialog({ label, icon, variant = 'secondary', title, description, action, hidden, submit, children }: { label: string; icon: ReactNode; variant?: ButtonProps['variant']; title: string; description?: string; action: AnyAction; hidden: Record<string, string>; submit: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title={title} description={description} trigger={<Button size="sm" variant={variant} icon={icon}>{label}</Button>}>
      <ActionForm action={action} onDone={() => setOpen(false)} className="space-y-4">
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {children}
        <FormField name="reason" label="Reason" required help="5–300 characters. Saved in the workspace's audit log.">
          <Textarea id="reason" name="reason" rows={2} maxLength={300} />
        </FormField>
        <div className="flex justify-end">
          <SubmitButton variant={variant === 'danger' ? 'danger' : 'primary'}>{submit}</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}

type OrgActionsProps = {
  orgId: string
  slug: string
  name: string
  plan: string
  trialing: boolean
  accountType: AccountType
  /** 'YYYY-MM-DD' or '' */
  compedUntil: string
  disabled: boolean
  deleted: boolean
  hasRazorpay: boolean
  /** What this staff member's role allows (lib/console/roles); the server checks again. */
  can: { extend: boolean; extendMore: boolean; endTrial: boolean; plan: boolean; type: boolean; status: boolean; disable: boolean; restore: boolean }
  /** Trial extensions so far (Sales may extend once). */
  extensions: number
  /** Console setting: the most days Sales may add in its one extension. */
  salesExtensionDays: number
  current: { plan: string; seats: number; work: number; musterTier: string; muster: number; orbit: number; folio: boolean; cycle: string; periodEnd: string; amountRupees: string }
  /** Paid add-ons switched on (lib/addons). */
  addOns?: string[]
}

/** Account actions on /console/accounts/[id], shown by role. */
export function OrgActions(props: OrgActionsProps) {
  const { orgId, slug, name, current } = props
  const [plan, setPlan] = useState(current.plan === 'suite' ? 'suite' : 'custom')
  const [type, setType] = useState<string>(props.accountType)
  const id = { orgId }
  const { can } = props
  const salesOnce = !can.extendMore
  const canExtend = can.extend && (can.extendMore || props.extensions === 0)
  const extend = extendDialogCopy({ salesOnce, salesMaxDays: props.salesExtensionDays })
  const words = windowWords(props.accountType)
  return (
    <div className="flex flex-wrap gap-2">
      {props.plan === 'trial' && canExtend ? (
        <ActionDialog label={words.extendLabel} icon={<CalendarPlus className="size-4" />} title={`Extend the ${words.noun} for ${name}`} description={extend.description} action={extendTrial} hidden={id} submit={words.extendLabel}>
          <FormField name="days" label="Days to add" required help={extend.help}>
            <Input id="days" name="days" inputMode="numeric" defaultValue={extend.defaultDays} />
          </FormField>
        </ActionDialog>
      ) : null}
      {props.trialing && can.endTrial ? <ActionDialog label={words.endLabel} icon={<TimerOff className="size-4" />} variant="danger" title={`End the ${words.noun} for ${name}?`} description={words.endDescription} action={endTrialNow} hidden={id} submit={words.endLabel} /> : null}

      {can.plan ? <ActionDialog label="Change plan" icon={<Repeat className="size-4" />} title={`Set a plan for ${name}`} description={`No invoice is issued. Minimums aren't enforced for staff.${props.hasRazorpay ? " This doesn't change Razorpay: cancel it there or from the workspace first." : ''}`} action={changePlanManually} hidden={id} submit="Set plan">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="plan" label="Plan">
            <Select name="plan" value={plan} onValueChange={setPlan} options={[{ value: 'suite', label: 'Suite' }, { value: 'custom', label: 'Custom' }]} />
          </FormField>
          <FormField name="cycle" label="Cycle">
            <Select name="cycle" defaultValue={current.cycle === 'yearly' ? 'yearly' : 'monthly'} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
          </FormField>
          {plan === 'suite' ? (
            <FormField name="seats" label="People">
              <Input id="seats" name="seats" inputMode="numeric" defaultValue={current.seats || 10} />
            </FormField>
          ) : (
            <>
              <FormField name="work" label="Work users (0 = none)"><Input id="work" name="work" inputMode="numeric" defaultValue={current.work} /></FormField>
              <FormField name="musterTier" label="Muster">
                <Select name="musterTier" defaultValue={current.musterTier || 'none'} options={[{ value: 'none', label: 'None' }, { value: 'starter', label: 'Starter' }, { value: 'business', label: 'Business' }]} />
              </FormField>
              <FormField name="muster" label="Muster employees"><Input id="muster" name="muster" inputMode="numeric" defaultValue={current.muster} /></FormField>
              <FormField name="orbit" label="Orbit sales users (0 = none)"><Input id="orbit" name="orbit" inputMode="numeric" defaultValue={current.orbit} /></FormField>
              <div className="flex items-end pb-2"><Checkbox name="folio" defaultChecked={current.folio} label="Folio" /></div>
            </>
          )}
          <FormField name="periodEnd" label="Last day of the period" required>
            <DateInput id="periodEnd" name="periodEnd" defaultValue={current.periodEnd} />
          </FormField>
          <FormField name="amount" label="Price per period, ex-GST (₹)" help="0 = complimentary">
            <Input id="amount" name="amount" inputMode="decimal" defaultValue={current.amountRupees} />
          </FormField>
        </div>
      </ActionDialog> : null}

      {can.type ? <ActionDialog label="Account type" icon={<Tags className="size-4" />} title={`Set the account type for ${name}`} description="Internal and Test are never billed or reminded and are left out of every metric. Comped needs an end date." action={setAccountType} hidden={id} submit="Set type">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="accountType" label="Type">
            <Select name="accountType" value={type} onValueChange={setType} options={ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABEL[t] }))} />
          </FormField>
          {type === 'comped' ? (
            <FormField name="compedUntil" label="Comped until" required>
              <DateInput id="compedUntil" name="compedUntil" defaultValue={props.compedUntil} />
            </FormField>
          ) : null}
        </div>
      </ActionDialog> : null}

      {can.plan ? <ActionDialog label="Add-ons" icon={<Settings2 className="size-4" />} title={`Add-ons for ${name}`} description="The client portal is included in Suite. A trial and Internal or Test workspaces get every add-on." action={setAddOns} hidden={id} submit="Save add-ons">
        <div className="space-y-2">
          {ADD_ONS.map((a) => <Checkbox key={a} name={a} defaultChecked={(props.addOns ?? []).includes(a)} label={ADD_ON_LABEL[a]} />)}
        </div>
      </ActionDialog> : null}

      {can.status ? <ActionDialog label="Set status" icon={<Settings2 className="size-4" />} title={`Set the subscription status for ${name}`} description="For support fixes. Access is still derived from the dates." action={setSubscriptionStatus} hidden={id} submit="Set status">
        <FormField name="status" label="Status">
          <Select name="status" defaultValue="active" options={['trialing', 'active', 'past_due', 'canceled', 'expired'].map((s) => ({ value: s, label: s.replace('_', ' ') }))} />
        </FormField>
      </ActionDialog> : null}

      {props.deleted && can.restore ? (
        <ActionDialog label="Restore workspace" icon={<RotateCcw className="size-4" />} title={`Restore ${name}?`} description="Members get access again." action={restoreWorkspace} hidden={id} submit="Restore" />
      ) : props.deleted || !can.disable ? null : props.disabled ? (
        <ActionDialog label="Enable workspace" icon={<CircleCheck className="size-4" />} title={`Enable ${name}?`} action={setWorkspaceDisabled} hidden={{ ...id, disabled: 'false' }} submit="Enable" />
      ) : (
        <ActionDialog label="Disable workspace" icon={<Ban className="size-4" />} variant="danger" title={`Disable ${name}?`} description="Everyone is signed out and sees a notice with your reason until you enable it again." action={setWorkspaceDisabled} hidden={{ ...id, disabled: 'true' }} submit="Disable">
          <FormField name="confirm" label={`Type ${slug} to confirm`} required>
            <Input id="confirm" name="confirm" autoComplete="off" />
          </FormField>
        </ActionDialog>
      )}
    </div>
  )
}

/** Cancel one Flowbit invoice (refunds happen outside the app). */
export function CancelInvoiceButton({ invoiceId, number }: { invoiceId: string; number: string }) {
  return (
    <ActionDialog label="Cancel" icon={<XCircle className="size-3.5" />} variant="ghost" title={`Cancel invoice ${number}?`} description="The number stays in the series and the PDF shows CANCELLED. Refunds are handled outside Flowbit." action={cancelSubscriptionInvoice} hidden={{ invoiceId }} submit="Cancel invoice" />
  )
}

export const ConsoleAuditNote = ({ name }: { name: string }) => (
  <p className="flex items-center gap-1.5 text-xs text-[#959596]">
    <CircleSlash className="size-3.5" strokeWidth={1.5} /> Your actions are recorded in the Console audit and in the workspace&apos;s own log as {name} (Flowbit).
  </p>
)
