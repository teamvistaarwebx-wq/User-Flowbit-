'use client'

import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/input'
import { notifyBreachOwners } from '@/modules/console/breach-actions'

/** Console → Incidents: the breach notice to the owners of the listed workspaces (docs/BREACH-RUNBOOK.md step 4). */
export function BreachNoticeForm({ today }: { today: string }) {
  return (
    <ActionForm action={notifyBreachOwners} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField name="reference" label="Incident reference" required help="e.g. INC-2026-001, the same in every message"><Input id="reference" name="reference" /></FormField>
        <FormField name="discoveredOn" label="Found on" required><Input id="discoveredOn" name="discoveredOn" type="date" defaultValue={today} max={today} /></FormField>
      </div>
      <FormField name="workspaces" label="Affected workspaces" required help="Workspace ids or slugs, one per line. Every one must exist, or nothing is sent.">
        <Textarea id="workspaces" name="workspaces" rows={4} />
      </FormField>
      <FormField name="whatHappened" label="What happened" required><Textarea id="whatHappened" name="whatHappened" rows={3} maxLength={2000} /></FormField>
      <FormField name="dataAffected" label="Which data" required help="Kinds of records and fields, not the records themselves."><Textarea id="dataAffected" name="dataAffected" rows={3} maxLength={2000} /></FormField>
      <FormField name="whatWeDid" label="What Flowbit has done" required><Textarea id="whatWeDid" name="whatWeDid" rows={3} maxLength={2000} /></FormField>
      <FormField name="whatYouShouldDo" label="What owners should do" required><Textarea id="whatYouShouldDo" name="whatYouShouldDo" rows={3} maxLength={2000} /></FormField>
      <FormField name="confirm"><Checkbox name="confirm" label="I checked the list and the wording with the founder" description="Each owner gets an email that cannot be unsubscribed from, and a bell alert. Each workspace's audit log records it." /></FormField>
      <div className="flex justify-end"><SubmitButton>Send the notice</SubmitButton></div>
    </ActionForm>
  )
}
