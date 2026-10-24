'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { createAutomationAction } from '@/modules/automations/actions'
import { EVENT_TRIGGERS, isContactRecipient, SOURCE_TRIGGERS, triggerDef } from '@/modules/automations/catalog'
import { CONDITION_OP_LABELS, RECIPIENT_LABELS } from '@/modules/automations/describe'
import { CONDITION_OPS, SOURCE_KEYS, type RecipientType } from '@/modules/automations/types'
import { validateCustomRule, type CustomRuleInput } from '@/modules/automations/validate'
import { useWhatsAppOn } from '@/components/shell/shell-context'

/**
 * "New automation": pick when it runs (an event, before/after a date, or a
 * schedule), what must hold, and what to do (message a client, lead or
 * employee; alert people; add a follow-up task). The same validator as the
 * server checks it as you type.
 */

type ActionDraft = { type: 'message' | 'notify' | 'task'; recipient: string; channel: 'email' | 'whatsapp'; subject: string; body: string; dueInDays: number }
type ConditionDraft = { field: string; op: string; value: string }

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const eventOptions = Object.entries(EVENT_TRIGGERS).map(([value, d]) => ({ value, label: d.label }))
const dateSources = SOURCE_KEYS.filter((k) => SOURCE_TRIGGERS[k].units?.length).map((value) => ({ value, label: SOURCE_TRIGGERS[value].label }))
const scheduleSources = SOURCE_KEYS.filter((k) => SOURCE_TRIGGERS[k].schedulable).map((value) => ({ value, label: SOURCE_TRIGGERS[value].label }))

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm text-fg">
      <span>{text}</span>
      {children}
    </label>
  )
}

export function AutomationBuilder() {
  const [name, setName] = useState('')
  const whatsappOn = useWhatsAppOn()
  const [type, setType] = useState<'event' | 'date' | 'schedule'>('event')
  const [event, setEvent] = useState(eventOptions[0]?.value ?? '')
  const [source, setSource] = useState<string>(dateSources[0]?.value ?? '')
  const [offset, setOffset] = useState(1)
  const [unit, setUnit] = useState('days')
  const [frequency, setFrequency] = useState('daily')
  const [day, setDay] = useState(1)
  const [time, setTime] = useState('09:00')
  const [actions, setActions] = useState<ActionDraft[]>([{ type: 'notify', recipient: 'owner', channel: 'email', subject: '', body: '', dueInDays: 0 }])
  const [conditions, setConditions] = useState<ConditionDraft[]>([])
  const [delay, setDelay] = useState(0)
  const [business, setBusiness] = useState(false)
  const [cap, setCap] = useState(3)
  const [enabled, setEnabled] = useState(false)
  const [save, saving] = useAction(createAutomationAction)

  const trigger = useMemo(() => ({ type, ...(type === 'event' ? { event } : { source }), ...(type === 'date' ? { offset, unit } : {}), ...(type === 'schedule' ? { frequency, day, time } : {}) }), [type, event, source, offset, unit, frequency, day, time])
  const def = triggerDef(trigger as Parameters<typeof triggerDef>[0])
  const input: CustomRuleInput = { name, trigger, conditions: conditions.map((c) => ({ ...c, value: c.value === '' ? null : Number.isFinite(Number(c.value)) ? Number(c.value) : c.value })), actions, delayMinutes: delay, businessHoursOnly: business, dailyCapPerContact: cap }
  const check = validateCustomRule(input)
  const errors = check.ok ? {} : check.errors
  const recipients = (def?.recipients ?? []) as RecipientType[]
  const fields = [...new Set([...(def?.variables ?? []), ...(def?.conditionFields ?? [])])]
  const setAction = (i: number, patch: Partial<ActionDraft>) => setActions(actions.map((a, j) => (j === i ? { ...a, ...patch } : a)))
  const pickType = (next: typeof type) => {
    setType(next)
    if (next === 'date') setSource(dateSources[0]?.value ?? '')
    if (next === 'schedule') setSource(scheduleSources[0]?.value ?? '')
  }
  const err = (key: string) => (errors[key] ? <p className="text-xs text-[#ff7b77]">{errors[key]}</p> : null)

  return (
    <div className="space-y-4">
      <section className="card-solid space-y-4 rounded-[12px] px-[23px] pb-5 pt-[17px]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">When</h3>
        <Label text="Name">
          <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Big invoice paid → thank the owner" />
        </Label>
        {err('name')}
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text="Runs">
            <NativeSelect value={type} onChange={(e) => pickType(e.target.value as typeof type)} options={[{ value: 'event', label: 'When something happens' }, { value: 'date', label: 'Before or after a date' }, { value: 'schedule', label: 'On a schedule' }]} />
          </Label>
          {type === 'event' ? (
            <Label text="What happens">
              <NativeSelect value={event} onChange={(e) => setEvent(e.target.value)} options={eventOptions} />
            </Label>
          ) : (
            <Label text={type === 'date' ? 'Which date' : 'For'}>
              <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} options={type === 'date' ? dateSources : scheduleSources} />
            </Label>
          )}
          {type === 'date' ? (
            <>
              <Label text="How long (minus for before)">
                <Input type="number" value={offset} onChange={(e) => setOffset(Math.round(Number(e.target.value) || 0))} />
              </Label>
              <Label text="Unit">
                <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value)} options={(def?.units ?? ['days']).map((u) => ({ value: u, label: u }))} />
              </Label>
            </>
          ) : null}
          {type === 'schedule' ? (
            <>
              <Label text="How often">
                <NativeSelect value={frequency} onChange={(e) => setFrequency(e.target.value)} options={[{ value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }, { value: 'monthly', label: 'Every month' }]} />
              </Label>
              {frequency === 'weekly' ? (
                <Label text="Day">
                  <NativeSelect value={String(day)} onChange={(e) => setDay(Number(e.target.value))} options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))} />
                </Label>
              ) : null}
              {frequency === 'monthly' ? (
                <Label text="Day of the month (1–28)">
                  <Input type="number" min={1} max={28} value={day} onChange={(e) => setDay(Number(e.target.value) || 1)} />
                </Label>
              ) : null}
              <Label text="Time (IST)">
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Label>
            </>
          ) : null}
        </div>
        {[err('trigger.event'), err('trigger.source'), err('trigger.unit'), err('trigger.offset'), err('trigger.day'), err('trigger.time')]}
      </section>

      <section className="card-solid space-y-4 rounded-[12px] px-[23px] pb-5 pt-[17px]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Only if</h3>
        {conditions.map((c, i) => (
          <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <NativeSelect className="sm:w-56" value={c.field} options={fields.map((f) => ({ value: f, label: f }))} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} aria-label="Value" />
            <NativeSelect className="sm:w-40" value={c.op} options={CONDITION_OPS.map((op) => ({ value: op, label: CONDITION_OP_LABELS[op] }))} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))} aria-label="Test" />
            {c.op === 'empty' || c.op === 'not_empty' ? null : <Input className="sm:w-40" value={c.value} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} aria-label="Compare with" />}
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setConditions(conditions.filter((_, j) => j !== i))} aria-label="Remove condition" />
          </div>
        ))}
        <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} disabled={!fields.length} onClick={() => setConditions([...conditions, { field: fields[0] ?? '', op: 'eq', value: '' }])}>
          Add condition
        </Button>
        <p className="text-xs text-fg-3">Amounts are in paise (₹1 = 100). Every condition must hold.</p>
      </section>

      {actions.map((a, i) => (
        <section key={i} className="card-solid space-y-4 rounded-[12px] px-[23px] pb-5 pt-[17px]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Then {i + 1}</h3>
            {actions.length > 1 ? <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setActions(actions.filter((_, j) => j !== i))} aria-label="Remove step" /> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Label text="Do">
              <NativeSelect value={a.type} onChange={(e) => setAction(i, { type: e.target.value as ActionDraft['type'], recipient: e.target.value === 'message' ? (recipients.find(isContactRecipient) ?? '') : (recipients.find((r) => !isContactRecipient(r)) ?? 'owner') })} options={[{ value: 'notify', label: 'Alert people' }, { value: 'message', label: 'Send a message' }, { value: 'task', label: 'Add a follow-up task' }]} />
            </Label>
            <Label text="To">
              <NativeSelect value={a.recipient} onChange={(e) => setAction(i, { recipient: e.target.value })} options={recipients.filter((r) => (a.type === 'message' ? isContactRecipient(r) : !isContactRecipient(r) || r === 'employee')).map((r) => ({ value: r, label: RECIPIENT_LABELS[r] }))} />
            </Label>
            {a.type === 'message' ? (
              <Label text="Channel">
                <NativeSelect value={a.channel} onChange={(e) => setAction(i, { channel: e.target.value as ActionDraft['channel'] })} options={whatsappOn ? [{ value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp (email fallback)' }] : [{ value: 'email', label: 'Email' }]} />
              </Label>
            ) : null}
          </div>
          <Label text={a.type === 'message' ? 'Subject' : 'Title'}>
            <Input value={a.subject} maxLength={200} onChange={(e) => setAction(i, { subject: e.target.value })} />
          </Label>
          <Label text={a.type === 'message' ? 'Message' : 'Details'}>
            <Textarea value={a.body} rows={a.type === 'message' ? 6 : 3} maxLength={4000} onChange={(e) => setAction(i, { body: e.target.value })} />
          </Label>
          {def?.variables.length ? <p className="text-xs text-fg-3">Values you can use: {def.variables.map((v) => `{{${v}}}`).join(' ')}</p> : null}
          {[err(`actions.${i}.type`), err(`actions.${i}.recipient`), err(`actions.${i}.body`)]}
        </section>
      ))}
      <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} disabled={actions.length >= 5} onClick={() => setActions([...actions, { type: 'notify', recipient: recipients.find((r) => !isContactRecipient(r)) ?? 'owner', channel: 'email', subject: '', body: '', dueInDays: 0 }])}>
        Add a step
      </Button>
      {err('actions')}

      <section className="card-solid space-y-4 rounded-[12px] px-[23px] pb-5 pt-[17px]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Timing and safety</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label text="Wait before running (minutes)">
            <Input type="number" min={0} value={delay} onChange={(e) => setDelay(Math.max(0, Number(e.target.value) || 0))} />
          </Label>
          <Label text="Most automated messages per contact a day (0 = no limit)">
            <Input type="number" min={0} max={50} value={cap} onChange={(e) => setCap(Math.max(0, Number(e.target.value) || 0))} />
          </Label>
        </div>
        <Switch label="Only during business hours" description="Monday to Saturday, 9 am to 6 pm IST." checked={business} onCheckedChange={setBusiness} />
        <Switch label="Switch it on now" checked={enabled} onCheckedChange={setEnabled} />
      </section>
      <Button variant="primary" loading={saving} disabled={!check.ok} onClick={() => void save({ ...input, conditions: [...input.conditions], actions: [...input.actions], trigger: { ...input.trigger }, enabled })}>
        Save automation
      </Button>
    </div>
  )
}
