'use client'

import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { Targets } from '@/modules/orbit/constants'
import type { Option } from '@/modules/orbit/record-types'
import { saveGeneral, saveTargets } from '@/modules/orbit/settings.actions'
import { Note } from './parts'

export function TargetsForm({ targets, canEdit }: { targets: Targets; canEdit: boolean }) {
  const field = (name: keyof Targets, label: string, step = '1') => (
    <FormField name={name} label={label}><Input id={name} name={name} type="number" step={step} min={0} defaultValue={String(targets[name])} disabled={!canEdit} /></FormField>
  )
  return (
    <ActionForm action={saveTargets} className="grid gap-4 sm:grid-cols-3">
      {field('coldMinPct', 'Cold min %', '0.5')}
      {field('coldMaxPct', 'Cold max %', '0.5')}
      {field('warmPct', 'Warm %', '0.5')}
      {field('weeklyNewLeads', 'New leads / week')}
      {field('weeklyOutreach', 'Outreach / week')}
      {field('monthlyMeetings', 'Meetings / month')}
      <Note className="sm:col-span-3">
        Cold conversion is measured against everyone contacted, where 3–5% is realistic for pure outreach. Warm conversion is measured against everyone who replied, where 15% is fair. One number can&apos;t serve both. Editable on purpose: targets set once and never revised are how a role gets designed to fail.
      </Note>
      {canEdit ? <div className="flex justify-end sm:col-span-3"><SubmitButton>Save targets</SubmitButton></div> : null}
    </ActionForm>
  )
}

export function GeneralForm({ staleDays, defaultReviewerId, reviewers, canEdit }: { staleDays: number; defaultReviewerId: string | null; reviewers: Option[]; canEdit: boolean }) {
  return (
    <ActionForm action={saveGeneral} className="grid max-w-xl gap-4">
      <FormField name="staleDays" label="Stale after (days)" help="An open lead or deal with no activity for this long is flagged stale."><Input id="staleDays" name="staleDays" type="number" min={1} max={60} defaultValue={String(staleDays)} disabled={!canEdit} /></FormField>
      <FormField name="defaultReviewerId" label="Default reviewer" help="New leads get this reviewer unless someone with reviewer powers picks another.">
        <Select id="defaultReviewerId" name="defaultReviewerId" defaultValue={defaultReviewerId ?? undefined} options={reviewers} placeholder="None" disabled={!canEdit} />
      </FormField>
      {canEdit ? <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div> : null}
    </ActionForm>
  )
}
