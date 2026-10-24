'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { slugify } from '@/lib/utils'
import { createClaimForm } from '@/modules/muster/claims/form-actions'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ChipGroup } from '@/components/ui/chip-group'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

type Option = { value: string; label: string }
type Props = { categories: Option[]; employees: Option[]; today: string; payrollMonth: string; orgSlug: string; deadline: string }

/** New claim form: window, categories, receipts, payroll month, cap and who may use it. */
export function ClaimFormDialog({ categories, employees, today, payrollMonth, orgSlug, deadline }: Props) {
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [inPayroll, setInPayroll] = useState(true)
  const [eligible, setEligible] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const shown = employees.filter((e) => e.label.toLowerCase().includes(filter.toLowerCase()))

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      trigger={
        <Button variant="primary" icon={<Plus className="size-4" />}>
          New claim form
        </Button>
      }
      title="New claim form"
      description="People open the link, verify their work email and file expenses with receipts."
    >
      <ActionForm action={createClaimForm} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
        <FormField name="name" label="Name" required className="sm:col-span-2">
          <Input id="name" name="name" placeholder="October expenses" onChange={(e) => !slugTouched && setSlug(slugify(`${orgSlug} ${e.target.value}`))} />
        </FormField>
        <FormField name="slug" label="Link" required help={`People open /c/${slug || 'your-link'}`} className="sm:col-span-2">
          <Input id="slug" name="slug" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()) }} placeholder={`${orgSlug}-oct-2026`} />
        </FormField>
        <FormField name="description" label="Description" className="sm:col-span-2">
          <Textarea id="description" name="description" rows={2} placeholder="Travel, client meals and office purchases from October. Attach a receipt for each." />
        </FormField>
        <FormField name="opensOn" label="Opens on" required>
          <DateInput id="opensOn" name="opensOn" defaultValue={today} />
        </FormField>
        <FormField name="closesOn" label="Deadline" required>
          <DateInput id="closesOn" name="closesOn" defaultValue={deadline} min={today} />
        </FormField>
        <FormField name="categoryIds" label="Categories" required className="sm:col-span-2" help={categories.length ? undefined : 'Add categories on the Categories tab first.'}>
          <ChipGroup name="categoryIds" multiple options={categories} defaultValue={categories.map((c) => c.value)} />
        </FormField>
        <FormField name="maxClaimAmount" label="Most per claim (₹)" help="Leave blank for no cap beyond ₹10,00,000">
          <Input id="maxClaimAmount" name="maxClaimAmount" inputMode="decimal" placeholder="5000" />
        </FormField>
        <div className="space-y-3 lit-edge rounded-[10px] bg-white/[0.035] p-3">
          <Switch name="requiresReceipt" defaultChecked label="Receipt required" />
          <Switch name="includeInPayroll" checked={inPayroll} onCheckedChange={setInPayroll} label="Pay with salary" />
          {inPayroll ? (
            <FormField name="payrollMonth" label="Payroll month">
              <DateInput id="payrollMonth" name="payrollMonth" type="month" defaultValue={payrollMonth} />
            </FormField>
          ) : null}
        </div>
        <FormField name="eligibleEmployeeIds" label="Who can use it" help={eligible.length ? `${eligible.length} chosen` : 'Nobody ticked = everyone on payroll'} className="sm:col-span-2">
          <Input inputSize="sm" placeholder="Filter people" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-2" />
          <div className="scroll-fade-y grid max-h-40 gap-1 overflow-y-auto lit-edge rounded-[10px] bg-white/[0.035] p-2 sm:grid-cols-2">
            {shown.map((e) => (
              <label key={e.value} className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm text-white/85 transition-colors hover:bg-white/[0.06]">
                <input type="checkbox" name="eligibleEmployeeIds[]" value={e.value} checked={eligible.includes(e.value)} onChange={(ev) => setEligible((cur) => (ev.target.checked ? [...cur, e.value] : cur.filter((v) => v !== e.value)))} className="size-4 accent-[var(--orchid)]" />
                {e.label}
              </label>
            ))}
            {eligible.filter((v) => !shown.some((s) => s.value === v)).map((v) => (
              <input key={v} type="hidden" name="eligibleEmployeeIds[]" value={v} />
            ))}
          </div>
        </FormField>
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton pendingLabel="Creating…">Create form</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
