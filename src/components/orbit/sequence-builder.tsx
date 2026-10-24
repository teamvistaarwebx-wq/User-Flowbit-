'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { ActionForm, FormField, SubmitButton } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { saveSequence } from '@/modules/orbit/sequences/actions'
import { DEFAULT_DAILY_CAP, DEFAULT_WINDOW, MAX_STEPS, STEP_KINDS, STEP_LABEL, type StepKind } from '@/modules/orbit/sequences/rules'
import type { SequenceFormValues } from '@/modules/orbit/sequences/queries'

type Draft = { key: number; kind: StepKind; subject: string; body: string; note: string; waitDays: string }

const KIND_OPTIONS = STEP_KINDS.map((k) => ({ value: k, label: STEP_LABEL[k] }))
const HOURS = Array.from({ length: 25 }, (_, h) => ({ value: String(h), label: h === 0 ? '12 am' : h === 12 ? '12 pm' : h === 24 ? '12 am (midnight)' : h < 12 ? `${h} am` : `${h - 12} pm` }))
const FIRST_EMAIL = 'Hi {{first_name|there}},\n\nI’m {{owner}}. I came across {{company}} and thought we could help with …\n\nWould a 15-minute call this week work?\n\nThanks,\n{{owner}}'

let nextKey = 1
const draft = (kind: StepKind, from: Partial<Draft> = {}): Draft => ({ key: nextKey++, kind, subject: '', body: '', note: '', waitDays: kind === 'wait' ? '2' : '', ...from })

/** One step's fields. Names follow `steps.<i>.<field>` so the action reads them as an array. */
function StepFields({ step, index, update }: { step: Draft; index: number; update: (patch: Partial<Draft>) => void }) {
  const base = `steps.${index}`
  if (step.kind === 'wait') {
    return (
      <FormField name={`${base}.waitDays`} label="Days to wait" help="The next step runs this many days later, inside the send window.">
        <Input id={`${base}.waitDays`} name={`${base}.waitDays`} inputMode="numeric" value={step.waitDays} onChange={(e) => update({ waitDays: e.target.value })} className="max-w-32" />
      </FormField>
    )
  }
  if (step.kind === 'email') {
    return (
      <div className="space-y-3">
        <FormField name={`${base}.subject`} label="Subject" required>
          <Input id={`${base}.subject`} name={`${base}.subject`} maxLength={200} value={step.subject} onChange={(e) => update({ subject: e.target.value })} placeholder="Quick question for {{company}}" />
        </FormField>
        <FormField name={`${base}.body`} label="Email" required help="Variables: {{first_name}}, {{company}}, {{owner}}. Add a fallback after a bar: {{first_name|there}}. An unsubscribe link is added at the end.">
          <Textarea id={`${base}.body`} name={`${base}.body`} rows={7} maxLength={5000} value={step.body} onChange={(e) => update({ body: e.target.value })} />
        </FormField>
      </div>
    )
  }
  return (
    <FormField name={`${base}.note`} label={step.kind === 'call' ? 'What to cover on the call' : 'Reminder'} help="Becomes a task for the sender, due that day.">
      <Input id={`${base}.note`} name={`${base}.note`} maxLength={300} value={step.note} onChange={(e) => update({ note: e.target.value })} placeholder={step.kind === 'call' ? 'Call {{first_name}} about the proposal' : 'Check if they opened the deck'} />
    </FormField>
  )
}

/** The sequence builder: name, up to five steps, the IST send window and the daily cap. */
export function SequenceBuilder({ initial, readOnly = false }: { initial?: SequenceFormValues; readOnly?: boolean }) {
  const [steps, setSteps] = useState<Draft[]>(() =>
    initial?.steps.length
      ? initial.steps.map((s) => draft(s.kind, { subject: s.subject ?? '', body: s.body ?? '', note: s.note ?? '', waitDays: s.waitDays ? String(s.waitDays) : '' }))
      : [draft('email', { subject: 'Quick question for {{company}}', body: FIRST_EMAIL }), draft('wait'), draft('call')],
  )
  const update = (key: number, patch: Partial<Draft>) => setSteps(steps.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  const move = (index: number, by: number) => {
    const target = index + by
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSteps(next)
  }
  return (
    <ActionForm action={saveSequence} className="space-y-4">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <fieldset disabled={readOnly} className="space-y-4">
        <Card variant="solid" className="space-y-4 rounded-[10px]">
          <FormField name="name" label="Name" required>
            <Input id="name" name="name" maxLength={100} defaultValue={initial?.name ?? ''} placeholder="Cold outreach, 3 touches" />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField name="startHour" label="Send from (IST)"><Select id="startHour" name="startHour" options={HOURS.slice(0, 24)} defaultValue={String(initial?.startHour ?? DEFAULT_WINDOW.startHour)} /></FormField>
            <FormField name="endHour" label="Until (IST)"><Select id="endHour" name="endHour" options={HOURS.slice(1)} defaultValue={String(initial?.endHour ?? DEFAULT_WINDOW.endHour)} /></FormField>
            <FormField name="dailyCap" label="Emails a day per sender" help="Across all sequences.">
              <Input id="dailyCap" name="dailyCap" inputMode="numeric" defaultValue={String(initial?.dailyCap ?? DEFAULT_DAILY_CAP)} />
            </FormField>
          </div>
          <p className="text-xs text-fg-3">Emails go out Monday to Saturday inside this window. Calls and reminders become tasks for whoever enrolled the lead.</p>
        </Card>
        <FormField name="steps" label="">
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={step.key}>
                <Card variant="solid" className="space-y-3 rounded-[10px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardHeader label={`Step ${i + 1}`} className="mb-0 flex-1" />
                    <Select size="sm" name={`steps.${i}.kind`} options={KIND_OPTIONS} value={step.kind} onValueChange={(v) => update(step.key, { kind: v as StepKind, waitDays: v === 'wait' && !step.waitDays ? '2' : step.waitDays })} className="w-40" aria-label={`Step ${i + 1} type`} />
                    <IconButton label="Move up" size="sm" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></IconButton>
                    <IconButton label="Move down" size="sm" onClick={() => move(i, 1)} disabled={i === steps.length - 1}><ArrowDown className="size-4" /></IconButton>
                    <IconButton label="Remove step" size="sm" onClick={() => setSteps(steps.filter((s) => s.key !== step.key))} disabled={steps.length === 1}><Trash2 className="size-4" /></IconButton>
                  </div>
                  <StepFields step={step} index={i} update={(patch) => update(step.key, patch)} />
                </Card>
              </li>
            ))}
          </ol>
        </FormField>
      </fieldset>
      {readOnly ? (
        <p className="text-sm text-fg-3">Only the person who made this sequence, or a reviewer, can change it.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setSteps([...steps, draft('email')])} disabled={steps.length >= MAX_STEPS}>
            {steps.length >= MAX_STEPS ? `Up to ${MAX_STEPS} steps` : 'Add step'}
          </Button>
          <SubmitButton>{initial?.id ? 'Save sequence' : 'Create sequence'}</SubmitButton>
        </div>
      )}
    </ActionForm>
  )
}
