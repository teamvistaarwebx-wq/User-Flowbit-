'use client'

import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ActionForm, FormField, SubmitButton, useFieldError } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createLead } from '@/modules/orbit/leads.actions'
import type { OrbitChoices } from '@/modules/orbit/record-types'
import { Note } from './parts'

export type LeadFormProps = {
  choices: Pick<OrbitChoices, 'sources' | 'sectors' | 'owners' | 'reviewers'>
  canAssign: boolean
  defaultReviewerId?: string | null
  today: string
  onDone?: () => void
  onCancel?: () => void
}

/** Shows "Add anyway" once the server reports a duplicate open lead. */
function DuplicateToggle() {
  const error = useFieldError('companyName')
  if (!error?.includes('already exists')) return null
  return <Checkbox name="allowDuplicate" label="Add anyway" description="Keep both leads. You can merge their history later by hand." />
}

/** The 30-second lead form (page and quick-add dialog). */
export function LeadForm({ choices, canAssign, defaultReviewerId, today, onDone, onCancel }: LeadFormProps) {
  const another = useRef<HTMLInputElement>(null)
  const company = useRef<HTMLInputElement>(null)
  const [more, setMore] = useState(false)
  const [sector, setSector] = useState(choices.sectors.find((s) => s.primary)?.key ?? choices.sectors[0]?.key ?? '')
  const primary = choices.sectors.find((s) => s.key === sector)?.primary

  return (
    <ActionForm
      action={createLead}
      className="grid gap-4 sm:grid-cols-2"
      onDone={(result) => {
        if (another.current?.value === 'on') {
          another.current.form?.reset()
          another.current.value = ''
          company.current?.focus()
          return
        }
        if (!result.redirect) onDone?.()
      }}
    >
      <input ref={another} type="hidden" name="addAnother" defaultValue="" />
      <FormField name="companyName" label="Company / brand" required className="sm:col-span-2">
        <Input ref={company} id="companyName" name="companyName" placeholder="e.g. Kesar & Clay" autoFocus maxLength={120} />
      </FormField>
      <div className="sm:col-span-2 -mt-2"><DuplicateToggle /></div>
      <FormField name="contactName" label="Contact name"><Input id="contactName" name="contactName" placeholder="Aditi Singh" maxLength={80} /></FormField>
      <FormField name="designation" label="Designation"><Input id="designation" name="designation" placeholder="Founder, Marketing Head" maxLength={80} /></FormField>
      <FormField name="sector" label="Sector" required help={primary ? 'Primary motion' : 'Secondary motion'}>
        <Select id="sector" name="sector" value={sector} onValueChange={setSector} options={choices.sectors.map((s) => ({ value: s.key, label: s.label }))} placeholder="Pick a sector" />
      </FormField>
      <FormField name="source" label="Source" required>
        <Select id="source" name="source" defaultValue={choices.sources[0]?.key} options={choices.sources.map((s) => ({ value: s.key, label: s.label, hint: s.warm ? 'warm' : undefined }))} placeholder="Pick a source" />
      </FormField>
      <FormField name="email" label="Email"><Input id="email" name="email" type="email" placeholder="aditi@kesarclay.in" /></FormField>
      <FormField name="phone" label="Phone"><Input id="phone" name="phone" inputMode="tel" placeholder="98765 43210" /></FormField>

      <button type="button" onClick={() => setMore((v) => !v)} className="sm:col-span-2 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-white transition-opacity hover:opacity-75" aria-expanded={more}>
        <ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} /> More details
      </button>
      <div className={cn('grid gap-4 sm:col-span-2 sm:grid-cols-2', !more && 'hidden')}>
        <FormField name="instagramHandle" label="Instagram handle"><Input id="instagramHandle" name="instagramHandle" placeholder="@brand" /></FormField>
        <FormField name="linkedinUrl" label="LinkedIn URL"><Input id="linkedinUrl" name="linkedinUrl" placeholder="linkedin.com/in/…" /></FormField>
        <FormField name="website" label="Website"><Input id="website" name="website" placeholder="kesarclay.in" /></FormField>
        <FormField name="icpScore" label="ICP fit" help="1 = poor fit, 5 = ideal">
          <Select id="icpScore" name="icpScore" defaultValue="3" options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} / 5` }))} />
        </FormField>
        <FormField name="valueRupees" label="Est. deal value (₹)"><Input id="valueRupees" name="valueRupees" inputMode="decimal" placeholder="1,50,000" /></FormField>
        <FormField name="followUp.title" label="Next step"><Input id="followUp.title" name="followUp.title" placeholder="Send intro DM" maxLength={140} /></FormField>
        <FormField name="followUp.dueDate" label="Next step date"><DateInput id="followUp.dueDate" name="followUp.dueDate" min={today} /></FormField>
        {canAssign ? (
          <>
            <FormField name="ownerId" label="Owner"><Select id="ownerId" name="ownerId" options={choices.owners} placeholder="Me" /></FormField>
            <FormField name="reviewerId" label="Reviewer" help="One owner, one reviewer. No second boss.">
              <Select id="reviewerId" name="reviewerId" defaultValue={defaultReviewerId ?? undefined} options={choices.reviewers} placeholder="Default reviewer" />
            </FormField>
          </>
        ) : null}
        <FormField name="notes" label="Notes" className="sm:col-span-2"><Textarea id="notes" name="notes" rows={3} maxLength={2000} /></FormField>
      </div>

      <Note className="sm:col-span-2">
        Every lead starts at <span className="text-white">New</span>. It becomes Contacted once you log an outreach, and Engaged once they actually reply.
      </Note>
      <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
        {onCancel ? <Button variant="ghost" onClick={onCancel}>Cancel</Button> : null}
        <SubmitButton variant="secondary" pendingLabel="Saving…" onClick={() => { if (another.current) another.current.value = 'on' }}>Save and add another</SubmitButton>
        <SubmitButton pendingLabel="Adding…" onClick={() => { if (another.current) another.current.value = '' }}>Add lead</SubmitButton>
      </div>
    </ActionForm>
  )
}
