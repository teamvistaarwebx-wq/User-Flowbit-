'use client'

import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Input } from '@/components/ui/input'
import { setMeetingRetention } from '@/modules/work/meetings/ai/actions'

/** Settings → Privacy: how long meeting recordings and transcripts are kept. */
export function MeetingRetentionForm({ days }: { days: number }) {
  return (
    <ActionForm action={setMeetingRetention} className="flex flex-wrap items-end gap-2">
      <FormField name="days" label="Days to keep" className="w-32">
        <Input id="days" name="days" inputMode="numeric" defaultValue={String(days)} />
      </FormField>
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  )
}
