'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AlarmClockOff, CheckCheck, Trash2 } from 'lucide-react'
import { addDays } from '@/lib/dates'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog } from '@/components/ui/dialog'
import { DateInput, Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { closeFollowupAction, createFollowupAction, dropFollowupAction, snoozeFollowupAction } from '@/modules/folio/collections/actions'

const CHANNELS = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note', label: 'Note' },
]

/** Close · Snooze · Drop for one follow-up in the collections queue. */
export function FollowupActions({ id, clientName, today }: { id: string; clientName: string; today: string }) {
  const router = useRouter()
  const [closing, setClosing] = useState(false)
  const [snoozing, setSnoozing] = useState(false)
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Dialog open={closing} onOpenChange={setClosing} title={`Close the follow-up with ${clientName}`} description="Keep the outcome on the record, even if nothing happened." trigger={<Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />}>Close</Button>}>
        <ActionForm action={closeFollowupAction} onDone={() => setClosing(false)} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <FormField name="outcome" label="What happened?" required>
            <Textarea id="outcome" name="outcome" rows={3} placeholder="Spoke to Priya; payment run is on Friday." />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="promisedOn" label="Date they committed to">
              <DateInput id="promisedOn" name="promisedOn" min={today} />
            </FormField>
            <FormField name="nextOn" label="Chase again on" help="Opens the next follow-up automatically.">
              <DateInput id="nextOn" name="nextOn" min={today} />
            </FormField>
          </div>
          <div className="flex justify-end"><SubmitButton>Close follow-up</SubmitButton></div>
        </ActionForm>
      </Dialog>
      <Dialog open={snoozing} onOpenChange={setSnoozing} title="Come back on" description={`The follow-up with ${clientName} leaves the queue until then.`} size="sm" trigger={<Button size="sm" variant="ghost" icon={<AlarmClockOff className="size-4" />}>Snooze</Button>}>
        <ActionForm action={snoozeFollowupAction} onDone={() => setSnoozing(false)} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <FormField name="until" label="Date" required>
            <DateInput id="until" name="until" min={addDays(today, 1)} defaultValue={addDays(today, 3)} />
          </FormField>
          <div className="flex justify-end"><SubmitButton>Snooze</SubmitButton></div>
        </ActionForm>
      </Dialog>
      <ConfirmDialog
        trigger={<Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} aria-label="Drop follow-up">Drop</Button>}
        title="Drop this follow-up?"
        description="For one raised by mistake. Use Close instead if you actually spoke to them — that keeps the outcome on the record."
        confirmLabel="Drop"
        reason={{ label: 'Reason (optional)', placeholder: 'Raised twice by mistake' }}
        onConfirm={async (reason) => {
          const res = await dropFollowupAction({ id, reason: reason || undefined })
          if (res.ok) router.refresh()
          return res
        }}
      />
    </div>
  )
}

export type FollowupDialogOptions = {
  clients: { id: string; name: string }[]
  invoices: { id: string; clientId: string; number: string }[]
  members: { id: string; name: string }[]
  today: string
  me: string
}

/** New follow-up: client, optional invoice of that client, due date, channel, subject, notes, assignee. */
export function NewFollowupDialog({ options, trigger, defaultClientId, defaultInvoiceId }: { options: FollowupDialogOptions; trigger: ReactNode; defaultClientId?: string; defaultInvoiceId?: string }) {
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState(defaultClientId ?? '')
  const invoices = useMemo(() => options.invoices.filter((i) => i.clientId === clientId), [options.invoices, clientId])
  return (
    <Dialog open={open} onOpenChange={setOpen} title="New follow-up" description="Who to chase, when, and how." size="lg" trigger={trigger}>
      <ActionForm action={createFollowupAction} onDone={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
        <FormField name="clientId" label="Client" required className="sm:col-span-2">
          <Select name="clientId" value={clientId || undefined} onValueChange={setClientId} placeholder="Choose a client" options={options.clients.map((c) => ({ value: c.id, label: c.name }))} />
        </FormField>
        <FormField name="invoiceId" label="Invoice" help={clientId && !invoices.length ? 'This client has no open invoices.' : 'Optional.'}>
          <Select key={clientId} name="invoiceId" defaultValue={invoices.some((i) => i.id === defaultInvoiceId) ? defaultInvoiceId : undefined} placeholder="Whole account" disabled={!invoices.length} options={invoices.map((i) => ({ value: i.id, label: i.number }))} />
        </FormField>
        <FormField name="dueOn" label="Due" required>
          <DateInput id="dueOn" name="dueOn" defaultValue={options.today} />
        </FormField>
        <FormField name="channel" label="Channel">
          <Select name="channel" defaultValue="call" options={CHANNELS} />
        </FormField>
        <FormField name="assignedTo" label="Assign to">
          <Select name="assignedTo" defaultValue={options.members.some((m) => m.id === options.me) ? options.me : undefined} placeholder="Me" options={options.members.map((m) => ({ value: m.id, label: m.id === options.me ? `${m.name} (me)` : m.name }))} />
        </FormField>
        <FormField name="subject" label="Subject" className="sm:col-span-2">
          <Input id="subject" name="subject" placeholder="Confirm payment date for the September retainer" />
        </FormField>
        <FormField name="notes" label="Notes" className="sm:col-span-2">
          <Textarea id="notes" name="notes" rows={3} />
        </FormField>
        <div className="flex justify-end sm:col-span-2"><SubmitButton>Add follow-up</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}
