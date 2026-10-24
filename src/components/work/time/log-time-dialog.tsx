'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'
import { logTime } from '@/modules/work/time/actions'

type TargetOption = SelectOption & { billable?: boolean }

export function LogTimeDialog({ options, today }: { options: TargetOption[]; today: string }) {
  const [open, setOpen] = useState(false)
  /** Ticked by default for client work, as the timer and the grid do; the person can still change it. */
  const [billable, setBillable] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Log time" description="Add time you spent on a task or project." trigger={<Button variant="secondary" icon={<Plus className="size-4" />}>Log time</Button>}>
      <ActionForm action={logTime} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
        <FormField name="target" label="Task or project" required className="sm:col-span-2">
          <Select name="target" options={options} placeholder="Pick a task or project" onValueChange={(v) => setBillable(Boolean(options.find((o) => o.value === v)?.billable))} />
        </FormField>
        <FormField name="date" label="Date" required>
          <DateInput id="date" name="date" defaultValue={today} max={today} />
        </FormField>
        <FormField name="duration" label="Time" required help="1:30, 1h 30m or 90m">
          <Input id="duration" name="duration" placeholder="1:30" />
        </FormField>
        <FormField name="note" label="Note" className="sm:col-span-2">
          <Textarea id="note" name="note" rows={2} maxLength={500} placeholder="What did you do?" />
        </FormField>
        <Checkbox name="billable" label="Billable" description="Count this time towards client billing." checked={billable} onCheckedChange={setBillable} />
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton>Log time</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  )
}
