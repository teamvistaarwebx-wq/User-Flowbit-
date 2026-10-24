'use client'

import { FlaskConical, Languages, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAction } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { deleteAutomationAction, resetAutomationAction, saveAutomationAction, testAutomationAction } from '@/modules/automations/actions'
import { CONDITION_OP_LABELS, RECIPIENT_LABELS } from '@/modules/automations/describe'
import type { RuleDetail } from '@/modules/automations/queries'
import { renderTemplate, unknownVariables } from '@/modules/automations/template'
import { CONDITION_OPS, type Condition, type ConditionOp } from '@/modules/automations/types'
import { useWhatsAppOn } from '@/components/shell/shell-context'

/**
 * The automation editor: wording with variable chips and a live preview,
 * timing, channel and conditions. Saving keeps the recipe's trigger type
 * and actions; "Test on me" sends the saved version to you.
 */

type Copy = { subject: string; body: string; channel?: 'email' | 'whatsapp' }
type Field = 'subject' | 'body'

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp from your number (email as fallback)' },
]

const OP_OPTIONS = CONDITION_OPS.map((op) => ({ value: op, label: CONDITION_OP_LABELS[op] }))


function Preview({ copy, sample, isMessage }: { copy: Copy; sample: RuleDetail['sample']; isMessage: boolean }) {
  return (
    <div className="space-y-2 rounded-[10px] bg-white/[0.04] p-4 ring-1 ring-inset ring-white/10">
      <p className="text-xs uppercase tracking-[0.04em] text-fg-3">Preview with sample values</p>
      {copy.subject ? <p className="text-sm font-medium text-white">{renderTemplate(copy.subject, sample)}</p> : null}
      <p className="whitespace-pre-line text-[13px] leading-5 text-white/80">{renderTemplate(copy.body, sample)}</p>
      {isMessage ? <p className="text-xs text-fg-3">Clients can unsubscribe from automated messages; the link is added at the bottom.</p> : null}
    </div>
  )
}

function ActionCopyEditor({ index, detail, copy, onChange }: { index: number; detail: RuleDetail; copy: Copy; onChange: (next: Copy) => void }) {
  const action = detail.actions[index]
  const [focus, setFocus] = useState<Field>('body')
  const whatsappOn = useWhatsAppOn()
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const typos = unknownVariables(`${copy.subject} ${copy.body}`, detail.variables)
  const insert = (variable: string) => {
    const el = focus === 'subject' ? subjectRef.current : bodyRef.current
    const token = `{{${variable}}}`
    const value = copy[focus]
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange({ ...copy, [focus]: value.slice(0, start) + token + value.slice(end) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }
  const isMessage = action.type === 'message'
  const who = RECIPIENT_LABELS[action.recipient].toLowerCase()
  const heading = isMessage ? `Message to ${who}` : action.type === 'task' ? `Task for ${who}` : action.type === 'post' ? `${action.postType === 'welcome' ? 'Welcome' : 'Celebration'} post in Work → Posts` : `Alert to ${who}`
  return (
    <section className="card-solid space-y-4 rounded-[12px] px-[23px] pb-5 pt-[17px]">
      <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">{heading}</h3>
      {isMessage ? (
        <label className="block max-w-xs space-y-1.5 text-sm text-fg">
          <span>Channel</span>
          <NativeSelect value={copy.channel ?? 'email'} options={whatsappOn ? CHANNEL_OPTIONS : CHANNEL_OPTIONS.filter((o) => o.value !== 'whatsapp')} onChange={(e) => onChange({ ...copy, channel: e.target.value as Copy['channel'] })} />
        </label>
      ) : null}
      {detail.variables.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Insert a value">
          {detail.variables.map((v) => (
            <button key={v} type="button" onClick={() => insert(v)} className="press rounded-full bg-control px-2.5 py-1 font-mono text-[11px] text-white/80 ring-1 ring-inset ring-white/10 hover:bg-control-active">
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      ) : null}
      <label className="block space-y-1.5 text-sm text-fg">
        <span>{isMessage ? 'Subject' : 'Title'}</span>
        <Input ref={subjectRef} value={copy.subject} maxLength={200} onFocus={() => setFocus('subject')} onChange={(e) => onChange({ ...copy, subject: e.target.value })} />
      </label>
      <label className="block space-y-1.5 text-sm text-fg">
        <span>{isMessage ? 'Message' : 'Details'}</span>
        <Textarea ref={bodyRef} value={copy.body} rows={isMessage ? 7 : 3} maxLength={4000} onFocus={() => setFocus('body')} onChange={(e) => onChange({ ...copy, body: e.target.value })} />
      </label>
      {typos.length ? <p className="text-[13px] text-[#ff7b77]">Not a known value: {typos.map((t) => `{{${t}}}`).join(', ')}</p> : null}
      <Preview copy={copy} sample={detail.sample} isMessage={isMessage} />
    </section>
  )
}

function ConditionsEditor({ fields, conditions, onChange }: { fields: string[]; conditions: Condition[]; onChange: (next: Condition[]) => void }) {
  const fieldOptions = fields.map((f) => ({ value: f, label: f }))
  const set = (i: number, patch: Partial<Condition>) => onChange(conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <div className="space-y-3">
      {conditions.map((c, i) => (
        <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <NativeSelect className="sm:w-56" value={c.field} options={fieldOptions} onChange={(e) => set(i, { field: e.target.value })} aria-label="Value" />
          <NativeSelect className="sm:w-40" value={c.op} options={OP_OPTIONS} onChange={(e) => set(i, { op: e.target.value as ConditionOp })} aria-label="Test" />
          {c.op === 'empty' || c.op === 'not_empty' ? null : <Input className="sm:w-40" value={c.value == null ? '' : String(c.value)} onChange={(e) => set(i, { value: e.target.value })} aria-label="Compare with" />}
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => onChange(conditions.filter((_, j) => j !== i))} aria-label="Remove condition" />
        </div>
      ))}
      <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => onChange([...conditions, { field: fields[0] ?? 'balance_due_paise', op: 'eq', value: '' }])}>
        Add condition
      </Button>
      <p className="text-xs text-fg-3">Amounts in conditions are in paise (₹1 = 100). All conditions must hold.</p>
    </div>
  )
}

export function AutomationEditor({ detail }: { detail: RuleDetail }) {
  const whatsappOn = useWhatsAppOn()
  // While WhatsApp is off, a WhatsApp step is edited (and saved) as email.
  const [copies, setCopies] = useState<Copy[]>(detail.actions.map((a) => ({ subject: a.subject ?? '', body: a.body, channel: a.channel === 'whatsapp' && !whatsappOn ? 'email' : a.channel })))
  const [conditions, setConditions] = useState<Condition[]>(detail.conditions)
  const [delayMinutes, setDelay] = useState(detail.delayMinutes)
  const [businessHoursOnly, setBusiness] = useState(detail.businessHoursOnly)
  const [cap, setCap] = useState(detail.dailyCapPerContact)
  const [offset, setOffset] = useState(detail.trigger.offset ?? 0)
  const [time, setTime] = useState(detail.trigger.time ?? '09:00')
  const [day, setDay] = useState(detail.trigger.day ?? 1)
  const [save, saving] = useAction(saveAutomationAction)
  const [test, testing] = useAction(testAutomationAction)
  const [reset, resetting] = useAction(resetAutomationAction, { onDone: () => window.location.reload() })
  const [remove, deleting] = useAction(deleteAutomationAction)
  const unit = detail.trigger.unit ?? 'days'
  const hasMessage = detail.actions.some((a) => a.type === 'message')
  const submit = () =>
    save({
      id: detail.id,
      actions: copies.map((c) => ({ subject: c.subject, body: c.body, channel: c.channel })),
      delayMinutes,
      businessHoursOnly,
      dailyCapPerContact: cap,
      ...(detail.trigger.type === 'date' ? { offset } : {}),
      ...(detail.trigger.type === 'schedule' ? { time, day } : {}),
      conditions: conditions.map((c) => ({ ...c, value: c.value === '' || c.value == null ? null : Number.isFinite(Number(c.value)) ? Number(c.value) : String(c.value) })),
    })

  return (
    <div className="space-y-4">
      {copies.map((copy, i) => (
        <ActionCopyEditor key={i} index={i} detail={detail} copy={copy} onChange={(next) => setCopies(copies.map((c, j) => (j === i ? next : c)))} />
      ))}
      <section className="card-solid space-y-4 rounded-[12px] px-[23px] pb-5 pt-[17px]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Timing</h3>
        <p className="text-[13px] text-fg-2">{detail.triggerLabel}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {detail.trigger.type === 'date' ? (
            <label className="space-y-1.5 text-sm text-fg">
              <span>{offset < 0 ? `${unit} before` : `${unit} after`} (use a minus sign for before)</span>
              <Input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value) || 0)} />
            </label>
          ) : null}
          {detail.trigger.type === 'schedule' ? (
            <>
              <label className="space-y-1.5 text-sm text-fg">
                <span>Time (IST)</span>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
              <label className="space-y-1.5 text-sm text-fg">
                <span>{detail.trigger.frequency === 'weekly' ? 'Day of the week (0 = Sunday)' : 'Day of the month (1–28)'}</span>
                <Input type="number" min={detail.trigger.frequency === 'weekly' ? 0 : 1} max={detail.trigger.frequency === 'weekly' ? 6 : 28} value={day} onChange={(e) => setDay(Number(e.target.value) || 1)} />
              </label>
            </>
          ) : null}
          <label className="space-y-1.5 text-sm text-fg">
            <span>Wait before sending (minutes)</span>
            <Input type="number" min={0} value={delayMinutes} onChange={(e) => setDelay(Math.max(0, Number(e.target.value) || 0))} />
          </label>
          {hasMessage ? (
            <label className="space-y-1.5 text-sm text-fg">
              <span>Most automated messages per contact a day (0 = no limit)</span>
              <Input type="number" min={0} max={50} value={cap} onChange={(e) => setCap(Math.max(0, Number(e.target.value) || 0))} />
            </label>
          ) : null}
        </div>
        <Switch label="Only during business hours" description="Monday to Saturday, 9 am to 6 pm IST. Messages to clients also wait for your quiet hours." checked={businessHoursOnly} onCheckedChange={setBusiness} />
      </section>
      <section className="card-solid space-y-4 rounded-[12px] px-[23px] pb-5 pt-[17px]">
        <h3 className="text-sm font-semibold uppercase tracking-[0.04em] text-white">Conditions</h3>
        <ConditionsEditor fields={[...new Set([...detail.variables, ...detail.conditionFields])]} conditions={conditions} onChange={setConditions} />
      </section>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" loading={saving} onClick={() => void submit()}>
          Save
        </Button>
        <Button variant="secondary" icon={<FlaskConical className="size-4" />} loading={testing} onClick={() => test({ id: detail.id })}>
          Test on me
        </Button>
        {detail.isRecipe ? (
          <>
            <Button variant="ghost" icon={<RotateCcw className="size-4" />} loading={resetting} onClick={() => reset({ id: detail.id, language: 'en' })}>
              Reset to Flowbit&apos;s wording
            </Button>
            {detail.hindi ? (
              <Button variant="ghost" icon={<Languages className="size-4" />} loading={resetting} onClick={() => reset({ id: detail.id, language: 'hi' })}>
                Use Hindi wording
              </Button>
            ) : null}
          </>
        ) : (
          <Button variant="ghost" icon={<Trash2 className="size-4" />} loading={deleting} onClick={() => remove({ id: detail.id })}>
            Delete
          </Button>
        )}
      </div>
      <p className="text-xs text-fg-3">Test on me sends the saved version to you, with sample values.{detail.hindi ? ' Hindi wording is a first draft: read it through before you switch it on.' : ''}</p>
    </div>
  )
}
