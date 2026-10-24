'use client'

import { ActionForm, SubmitButton } from '@/components/ui/action-form'
import { markReplied, unenrollLead } from '@/modules/orbit/sequences/actions'

/** Replied (stops the sequence, logs the reply) and Remove from sequence. */
export function SequenceLeadButtons({ leadId }: { leadId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={markReplied}>
        <input type="hidden" name="leadId" value={leadId} />
        <SubmitButton size="sm" pendingLabel="Saving…">Replied</SubmitButton>
      </ActionForm>
      <ActionForm action={unenrollLead}>
        <input type="hidden" name="leadId" value={leadId} />
        <SubmitButton size="sm" variant="ghost" pendingLabel="Removing…">Remove from sequence</SubmitButton>
      </ActionForm>
    </div>
  )
}
