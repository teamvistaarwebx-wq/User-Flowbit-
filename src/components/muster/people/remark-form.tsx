'use client'

import { Eye, Lock } from 'lucide-react'
import { useState } from 'react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { DateInput, NativeSelect, Textarea } from '@/components/ui/input'
import { addRemark } from '@/modules/muster/people/record-actions'
import { isSharedWithEmployee, REMARK_FORM_KINDS, remarkVisibility } from '@/modules/muster/people/remarks'
import { REMARK_KIND_LABEL } from '@/modules/muster/settings/defaults'

/** Inline form for a remark (type, when, what), saying who will be able to read it. */
export function RemarkForm({ employeeId, firstName, today }: { employeeId: string; firstName: string; today: string }) {
  const [kind, setKind] = useState<string>('general')
  const shared = isSharedWithEmployee(kind)
  return (
    <ActionForm action={addRemark} resetOnSuccess className="grid gap-3 sm:grid-cols-[200px_180px_1fr]">
      <input type="hidden" name="employeeId" value={employeeId} />
      <FormField name="kind" label="Type">
        <NativeSelect id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} options={REMARK_FORM_KINDS.map((value) => ({ value, label: REMARK_KIND_LABEL[value] }))} />
      </FormField>
      <FormField name="occurredOn" label="When"><DateInput id="occurredOn" name="occurredOn" defaultValue={today} max={today} /></FormField>
      <p className="flex items-end gap-1.5 pb-2.5 text-xs text-fg-2" aria-live="polite">
        {shared ? <Eye className="size-3.5 text-blush" /> : <Lock className="size-3.5 text-fg-3" />}
        {remarkVisibility(kind, firstName)}
        <span className="text-fg-3">{kind === 'one_on_one' ? `· ${firstName} is notified` : shared ? '· in their self-service' : '· HR admins and executives'}</span>
      </p>
      <FormField name="body" label="Remark" className="sm:col-span-3"><Textarea id="body" name="body" rows={3} placeholder="What happened, in a sentence or two" /></FormField>
      <div className="flex justify-end sm:col-span-3"><SubmitButton size="sm" variant="violet">Save remark</SubmitButton></div>
    </ActionForm>
  )
}
