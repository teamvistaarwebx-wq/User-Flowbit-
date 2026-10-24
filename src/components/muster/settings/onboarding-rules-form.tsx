'use client'

import { FileCheck2 } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Card, CardHeader } from '@/components/ui/card'
import { ChipGroup } from '@/components/ui/chip-group'
import { Input } from '@/components/ui/input'
import { DOCUMENT_TYPES, docLabel } from '@/modules/muster/settings/defaults'
import { saveOnboardingRules } from '@/modules/muster/settings/rule-actions'

/** Which joining documents are mandatory, and how complete a joiner must be before they can start. */
export function OnboardingRulesForm({ mandatory, threshold, canWrite }: { mandatory: string[]; threshold: number; canWrite: boolean }) {
  return (
    <ActionForm action={saveOnboardingRules}>
      <Card variant="solid">
        <CardHeader label="Joining documents" icon={<FileCheck2 />} description="Each person's profile and self-service page show how many of these are on file. Below the threshold they stay before joining; an HR admin can start them anyway with a reason." />
        <div className="space-y-5">
          <FormField name="mandatoryDocuments" label="Mandatory documents">
            <ChipGroup multiple name="mandatoryDocuments" defaultValue={mandatory} disabled={!canWrite} options={DOCUMENT_TYPES.filter((t) => t !== 'Other').map((t) => ({ value: t, label: docLabel(t) }))} />
          </FormField>
          <FormField name="thresholdPercent" label="Complete enough to start (%)" help="Share of the mandatory documents needed before someone can be made active, on probation or an intern.">
            <Input id="thresholdPercent" name="thresholdPercent" inputMode="numeric" defaultValue={threshold} disabled={!canWrite} className="max-w-32" />
          </FormField>
          {canWrite ? <div className="flex justify-end"><SubmitButton>Save joining documents</SubmitButton></div> : null}
        </div>
      </Card>
    </ActionForm>
  )
}
