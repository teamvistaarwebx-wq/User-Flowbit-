'use client'

import { useState } from 'react'
import { CheckCircle2, Circle, KeyRound, Rocket, StickyNote } from 'lucide-react'
import { ActionForm, FormField, SubmitButton, useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { HANDOVER_LABEL, HANDOVER_STEPS, type HandoverStep } from '@/lib/console/handover'
import { cn } from '@/lib/utils'
import { addAccountNote, assignSalesperson, requestSupportAccess, setHandoverStep, startHandover } from '@/modules/console/crm-actions'

/** Account detail panels in the Console: salesperson, notes, handover checklist, support access request. */

export function AssignSalesperson({ orgId, current, options, canAssign }: { orgId: string; current: string | null; options: { value: string; label: string }[]; canAssign: boolean }) {
  const [run, pending] = useAction(assignSalesperson)
  const value = current ?? 'none'
  if (!canAssign) return <span className="text-sm text-white">{options.find((o) => o.value === value)?.label ?? 'Unassigned'}</span>
  return <Select size="sm" value={value} disabled={pending} onValueChange={(staffId) => staffId !== value && run({ orgId, staffId })} options={[{ value: 'none', label: 'Unassigned' }, ...options]} aria-label="Salesperson" className="w-[200px]" />
}

export function NoteForm({ orgId }: { orgId: string }) {
  return (
    <ActionForm action={addAccountNote} resetOnSuccess className="space-y-2">
      <input type="hidden" name="orgId" value={orgId} />
      <FormField name="text" label="Add a note" help="Only the Flowbit team sees notes.">
        <Textarea id="text" name="text" rows={2} maxLength={2000} />
      </FormField>
      <div className="flex justify-end">
        <SubmitButton size="sm" icon={<StickyNote className="size-3.5" />}>Save note</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function HandoverChecklist({ orgId, done, canEdit, started }: { orgId: string; done: Partial<Record<HandoverStep, string>>; canEdit: boolean; started: boolean }) {
  const [run, pending] = useAction(setHandoverStep)
  const [start, starting] = useAction(startHandover)
  return (
    <div className="space-y-2">
      {!started && canEdit ? (
        <Button size="sm" variant="secondary" icon={<Rocket className="size-3.5" />} loading={starting} onClick={() => start({ orgId })}>Start setup (shows the Setup guide)</Button>
      ) : null}
      <ul className="space-y-1">
        {HANDOVER_STEPS.map((step) => {
          const at = done[step]
          return (
            <li key={step}>
              <button
                type="button"
                disabled={!canEdit || pending}
                onClick={() => run({ orgId, step, done: !at })}
                className={cn('flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors', canEdit && 'hover:bg-white/[0.05]', at ? 'text-white' : 'text-fg-2')}
              >
                {at ? <CheckCircle2 className="size-4 shrink-0 text-[#2DCBAF]" /> : <Circle className="size-4 shrink-0" />}
                <span className="flex-1">{HANDOVER_LABEL[step]}</span>
                {at ? <span className="text-xs text-[#979797]">{new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function SupportRequestButton({ orgId, canImport }: { orgId: string; canImport: boolean }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('read')
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Ask the owner for access" description="Nothing opens until the owner approves. Read-only access ends on its own; import access lasts 7 days and needs the owner's DPA acceptance." trigger={<Button size="sm" variant="secondary" icon={<KeyRound className="size-3.5" />}>Request access</Button>}>
      <ActionForm action={requestSupportAccess} onDone={() => setOpen(false)} className="space-y-4">
        <input type="hidden" name="orgId" value={orgId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField name="mode" label="Access">
            <Select name="mode" value={mode} onValueChange={setMode} options={[{ value: 'read', label: 'Read-only' }, ...(canImport ? [{ value: 'import', label: 'Import only (7 days)' }] : [])]} />
          </FormField>
          {mode === 'read' ? (
            <FormField name="hours" label="Hours" help="1–72">
              <Input id="hours" name="hours" inputMode="numeric" defaultValue="24" />
            </FormField>
          ) : null}
        </div>
        <FormField name="reason" label="Reason" required help="The owner sees this in the request.">
          <Textarea id="reason" name="reason" rows={2} maxLength={300} />
        </FormField>
        <div className="flex justify-end"><SubmitButton>Send request</SubmitButton></div>
      </ActionForm>
    </Dialog>
  )
}
