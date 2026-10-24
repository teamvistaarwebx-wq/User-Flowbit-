'use client'

import { Check, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { formatINR } from '@/lib/money'
import { adjustClaim, approveClaim, rejectClaim } from '@/modules/muster/claims/review-actions'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'

type Props = { id: string; employee: string; claimed: number; purpose: string }

/** Approve in full, approve a reduced amount (with a note), or reject (with a note). */
export function ClaimDecision({ id, employee, claimed, purpose }: Props) {
  const [run, pending] = useAction(approveClaim)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="secondary" icon={<Check className="size-3.5" />} loading={pending} onClick={() => run({ id })}>
        Approve
      </Button>
      <Dialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        trigger={
          <IconButton label="Approve a reduced amount" size="sm">
            <Pencil className="size-3.5" />
          </IconButton>
        }
        title="Approve a reduced amount"
        description={`${employee} claimed ${formatINR(claimed)} for ${purpose}.`}
      >
        <ActionForm action={adjustClaim} onDone={() => setAdjustOpen(false)} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <FormField name="amount" label="Amount to approve (₹)" required help={`At most ${formatINR(claimed)}`}>
            <Input id="amount" name="amount" inputMode="decimal" placeholder="800" autoFocus />
          </FormField>
          <FormField name="note" label="Why it was reduced" required>
            <Textarea id="note" name="note" rows={3} placeholder="Only one meal is covered by the policy." />
          </FormField>
          <div className="flex justify-end">
            <SubmitButton pendingLabel="Approving…">Approve reduced amount</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
      <Dialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        trigger={
          <IconButton label="Reject" size="sm">
            <X className="size-3.5 text-[#FF6A66]" />
          </IconButton>
        }
        title="Reject this claim?"
        description={`${employee} is emailed your note with the decision.`}
      >
        <ActionForm action={rejectClaim} onDone={() => setRejectOpen(false)} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <FormField name="note" label="Reason" required>
            <Textarea id="note" name="note" rows={3} placeholder="This expense is not covered by the travel policy." autoFocus />
          </FormField>
          <div className="flex justify-end">
            <SubmitButton variant="danger" pendingLabel="Rejecting…">
              Reject claim
            </SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </div>
  )
}
