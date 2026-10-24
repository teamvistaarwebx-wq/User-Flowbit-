'use client'

import { useState } from 'react'
import { Gift, MessageSquareText } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { grantPromoCredit, setAllowanceOverride } from '@/modules/wallet/console-actions'

/** Console Admin: free WhatsApp credit into a workspace's promo balance, with a reason (audited). */
export function GrantPromoDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Grant free WhatsApp credit" description="Goes into the promo balance (no GST, used first). Saved in the ledger and the audit log." trigger={<Button size="sm" variant="secondary" icon={<Gift className="size-4" />}>Grant credit</Button>}>
      <ActionForm action={grantPromoCredit} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="orgId" value={orgId} />
        <FormField name="amount" label="Amount (₹)" required><Input id="amount" name="amount" inputMode="numeric" /></FormField>
        <FormField name="reason" label="Reason" required help="5–300 characters, e.g. founding customer, apology for an outage.">
          <Textarea id="reason" name="reason" rows={2} maxLength={300} />
        </FormField>
        <div className="flex justify-end"><SubmitButton>Grant</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}

/** Console Admin: this workspace's free WhatsApp messages a month instead of its plan's (blank = the plan's), with a reason (audited). */
export function AllowanceOverrideDialog({ orgId, current, planAllowance }: { orgId: string; current: number | null; planAllowance: number }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Free messages a month" description={`The plan gives ${planAllowance} a month. Set a number for this workspace only, or leave it blank to use the plan's.`} trigger={<Button size="sm" variant="secondary" icon={<MessageSquareText className="size-4" />}>Free messages</Button>}>
      <ActionForm action={setAllowanceOverride} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="orgId" value={orgId} />
        <FormField name="messages" label="Free messages a month" help="Blank = the plan's allowance. 0 = none."><Input id="messages" name="messages" inputMode="numeric" defaultValue={current == null ? '' : String(current)} /></FormField>
        <FormField name="reason" label="Reason" required help="5–300 characters.">
          <Textarea id="reason" name="reason" rows={2} maxLength={300} />
        </FormField>
        <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}
