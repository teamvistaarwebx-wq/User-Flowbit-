'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, CalendarClock, Plus, Send, Trash2, X } from 'lucide-react'
import { WEEKDAY_SHORT } from '@/lib/dates'
import { useAction } from '@/components/ui/action-form'
import { Button, IconButton } from '@/components/ui/button'
import { ChipGroup, type Chip } from '@/components/ui/chip-group'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DateInput, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SurfaceHeader } from '@/components/settings/surface'
import { createBrief, deleteBrief, previewBrief, updateBrief } from '@/modules/briefs/actions'
import { useWhatsAppOn } from '@/components/shell/shell-context'

type Priority = 'urgent' | 'high' | 'medium' | 'low'
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']

export type SectionOption = { key: string; label: string; area: string }

export type BriefForm = {
  id: string
  name: string
  enabled: boolean
  time: string
  frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly'
  days: number[]
  weekday: number
  channels: { inapp: boolean; email: boolean }
  sections: string[]
  priorities: Priority[]
  projectIds: string[]
  scope: 'assigned' | 'created' | 'watching'
  skipIfEmpty: boolean
  nextRun: string | null
  lastSent: string | null
}

const FREQUENCIES = [
  { value: 'daily', label: 'On chosen days' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly', label: 'Once a week' },
  { value: 'monthly', label: 'Monthly, on the 1st' },
]
const DAY_CHIPS: Chip[] = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: WEEKDAY_SHORT[d] }))
const PRIORITY_CHIPS: Chip[] = PRIORITIES.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))
const SCOPES = [
  { value: 'assigned', label: 'Tasks assigned to me' },
  { value: 'created', label: 'Tasks I created' },
  { value: 'watching', label: 'Tasks I watch' },
]

export function NewBriefButton({ label }: { label: string }) {
  const [create, pending] = useAction(createBrief)
  return (
    <Button variant="primary" icon={<Plus className="size-4" />} loading={pending} onClick={() => create({})}>
      {label}
    </Button>
  )
}

const move = (list: string[], index: number, by: number): string[] => {
  const target = index + by
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** One brief: when, where, what (ordered sections) and filters, with "Send me a preview now". */
export function BriefEditor({ brief, sections, projects }: { brief: BriefForm; sections: SectionOption[]; projects: Chip[] }) {
  const [form, setForm] = useState(brief)
  const whatsappOn = useWhatsAppOn()
  const [save, saving] = useAction(updateBrief)
  const [preview, previewing] = useAction(previewBrief, { noRefresh: true })
  const [remove] = useAction(deleteBrief)
  const set = (patch: Partial<BriefForm>) => setForm({ ...form, ...patch })
  const labelOf = (key: string) => sections.find((s) => s.key === key)?.label ?? key
  const available = sections.filter((s) => !form.sections.includes(s.key))
  const { nextRun, lastSent, ...payload } = form

  return (
    <section className="card-table space-y-6 p-5">
      <SurfaceHeader
        icon={<CalendarClock strokeWidth={1.5} />}
        label={form.name || 'Brief'}
        description={form.enabled ? (nextRun ? `Next: ${nextRun}${lastSent ? ` · last sent ${lastSent}` : ''}` : 'Never runs: pick a day.') : 'Paused'}
        actions={<Switch aria-label="Brief on" checked={form.enabled} onCheckedChange={(enabled) => set({ enabled })} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Name">
            <Input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Time (IST)">
              <DateInput type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} />
            </Field>
            <Field label="How often">
              <Select aria-label="How often" value={form.frequency} options={FREQUENCIES} onValueChange={(v) => set({ frequency: v as BriefForm['frequency'] })} />
            </Field>
          </div>
          {form.frequency === 'daily' ? (
            <Field label="Days">
              <ChipGroup multiple size="sm" options={DAY_CHIPS} value={form.days.map(String)} onValueChange={(v) => set({ days: v.map(Number) })} />
            </Field>
          ) : null}
          {form.frequency === 'weekly' ? (
            <Field label="Day">
              <Select aria-label="Day of the week" value={String(form.weekday)} options={DAY_CHIPS} onValueChange={(v) => set({ weekday: Number(v) })} />
            </Field>
          ) : null}
          <Field label="Where">
            <div className="space-y-2">
              <Switch label="In-app (the bell)" checked={form.channels.inapp} onCheckedChange={(inapp) => set({ channels: { ...form.channels, inapp } })} />
              <Switch label="Email" checked={form.channels.email} onCheckedChange={(email) => set({ channels: { ...form.channels, email } })} />
              {whatsappOn ? <Switch label="WhatsApp" description="Connect WhatsApp (coming soon)" checked={false} disabled /> : null}
            </div>
          </Field>
          <Switch label="Skip when there is nothing" description="Send nothing on days when every section is empty." checked={form.skipIfEmpty} onCheckedChange={(skipIfEmpty) => set({ skipIfEmpty })} />
        </div>
        <div className="space-y-4">
          <Field label="Sections, in order">
            <ol className="space-y-1.5">
              {form.sections.map((key, i) => (
                <li key={key} className="flex items-center gap-2 rounded-[10px] bg-white/[0.035] py-1 pl-3 pr-1 text-sm text-white">
                  <span className="min-w-0 flex-1 truncate">{labelOf(key)}</span>
                  <IconButton size="sm" variant="ghost" label="Move up" disabled={i === 0} onClick={() => set({ sections: move(form.sections, i, -1) })}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" label="Move down" disabled={i === form.sections.length - 1} onClick={() => set({ sections: move(form.sections, i, 1) })}>
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" label="Remove" onClick={() => set({ sections: form.sections.filter((s) => s !== key) })}>
                    <X className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ol>
            {available.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {available.map((s) => (
                  <button key={s.key} type="button" className="rounded-full bg-control px-3 py-1 text-xs text-white/80 hover:bg-control-active hover:text-white" onClick={() => set({ sections: [...form.sections, s.key] })}>
                    + {s.area}: {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </Field>
          <Field label="Which tasks">
            <Select aria-label="Which tasks" value={form.scope} options={SCOPES} onValueChange={(v) => set({ scope: v as BriefForm['scope'] })} />
          </Field>
          <Field label="Only these priorities (none = all)">
            <ChipGroup multiple size="sm" options={PRIORITY_CHIPS} value={form.priorities} onValueChange={(v) => set({ priorities: PRIORITIES.filter((p) => v.includes(p)) })} />
          </Field>
          {projects.length ? (
            <Field label="Only these projects (none = all)">
              <ChipGroup multiple size="sm" options={projects} value={form.projectIds} onValueChange={(projectIds) => set({ projectIds })} />
            </Field>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button variant="primary" loading={saving} onClick={() => save(payload)}>
          Save
        </Button>
        <Button variant="secondary" icon={<Send className="size-4" />} loading={previewing} onClick={() => preview({ id: form.id })}>
          Send me a preview now
        </Button>
        <span className="flex-1" />
        <ConfirmDialog
          trigger={
            <Button variant="ghost" icon={<Trash2 className="size-4" />}>
              Delete
            </Button>
          }
          title={`Delete ${form.name}?`}
          description="It stops at once. You can create a new brief any time."
          confirmLabel="Delete brief"
          onConfirm={() => remove({ id: form.id })}
        />
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-fg-3">{label}</p>
      {children}
    </div>
  )
}
