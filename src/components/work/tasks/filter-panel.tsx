'use client'

import { SlidersHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { PRIORITY_LABEL, STATUS_LABEL, TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/modules/work/tasks/constants'
import { activeFilterCount, DUE_LABEL, DUE_PRESETS, type DuePreset, type TaskQuery } from '@/modules/work/tasks/filters'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ChipGroup } from '@/components/ui/chip-group'
import { NativeSelect } from '@/components/ui/input'
import { Popover } from '@/components/ui/popover'
import { tasksHref, type LockedFilter } from './href'
import { PeoplePicker } from './people-picker'
import { useTaskData } from './task-data'

const ANY = 'any'

function CheckList({ items, value, onChange }: { items: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!items.length) return <p className="text-[13px] text-fg-2">Nothing to pick yet.</p>
  return (
    <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1 scroll-fade-y">
      {items.map((i) => (
        <Checkbox key={i.id} label={i.label} checked={value.includes(i.id)} onCheckedChange={(on) => onChange(on ? [...value, i.id] : value.filter((v) => v !== i.id))} />
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-2">{title}</h4>
      {children}
    </section>
  )
}

/** Filter button + panel: status, priority, due, assignee, project, client, space/list, created by me. */
export function FilterPanel({ query, basePath, locked = [] }: { query: TaskQuery; basePath: string; locked?: LockedFilter[] }) {
  const router = useRouter()
  const data = useTaskData()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<TaskQuery>(query)
  const count = activeFilterCount(query, locked)
  const set = (patch: Partial<TaskQuery>) => setDraft((d) => ({ ...d, ...patch }))
  const folders = data.spaces.find((s) => s.id === draft.space)?.folders ?? []

  const apply = (next: TaskQuery) => {
    setOpen(false)
    router.push(tasksHref(basePath, next, { page: 1, saved: null }))
  }
  const cleared: TaskQuery = {
    ...query, mine: false, created: false, assignee: [], priority: [], status: [], due: null, tag: null, q: '', client: locked.includes('client') ? query.client : [],
    project: locked.includes('project') ? query.project : [], space: locked.includes('space') ? query.space : null, folder: locked.includes('folder') ? query.folder : null,
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(query)
        setOpen(next)
      }}
      align="end"
      className="w-[min(380px,calc(100vw-32px))] space-y-4"
      trigger={
        <Button variant="secondary" size="sm" icon={<SlidersHorizontal className="size-3.5" />}>
          Filter
          {count ? <span className="rounded-full bg-chip-active px-1.5 text-[11px] tabular-nums text-white">{count}</span> : null}
        </Button>
      }
    >
      <Section title="Status">
        <ChipGroup multiple size="sm" value={draft.status} onValueChange={(v) => set({ status: v as TaskStatus[] })} options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
      </Section>
      <Section title="Priority">
        <ChipGroup multiple size="sm" value={draft.priority} onValueChange={(v) => set({ priority: v as TaskPriority[] })} options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
      </Section>
      <Section title="Due date">
        <ChipGroup size="sm" value={draft.due ?? ANY} onValueChange={(v) => set({ due: v === ANY ? null : (v as DuePreset) })} options={[{ value: ANY, label: 'Any' }, ...DUE_PRESETS.map((d) => ({ value: d, label: DUE_LABEL[d] }))]} />
      </Section>
      {!locked.includes('personal') ? (
        <Section title="Assignee">
          <PeoplePicker
            people={data.people}
            value={draft.assignee}
            onChange={(ids) => set({ assignee: ids })}
            trigger={<Button variant="secondary" size="sm" className="w-full justify-start">{draft.assignee.length ? draft.assignee.map((id) => data.nameOf(id)).join(', ') : 'Anyone'}</Button>}
          />
          <Checkbox label="Created by me" checked={draft.created} onCheckedChange={(on) => set({ created: on })} />
        </Section>
      ) : null}
      {!locked.includes('project') && !query.personal ? (
        <Section title="Project">
          <CheckList items={data.projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))} value={draft.project} onChange={(v) => set({ project: v })} />
        </Section>
      ) : null}
      {data.clients.length && !query.personal && !locked.includes('client') ? (
        <Section title="Client">
          <CheckList items={data.clients.map((c) => ({ id: c.id, label: c.name }))} value={draft.client} onChange={(v) => set({ client: v })} />
        </Section>
      ) : null}
      {!locked.includes('space') && !query.personal && data.spaces.length ? (
        <Section title="Space and list">
          <div className="grid grid-cols-2 gap-2">
            <NativeSelect aria-label="Space" value={draft.space ?? ''} onChange={(e) => set({ space: e.target.value || null, folder: null })} placeholder="Any space" options={data.spaces.map((s) => ({ value: s.id, label: s.name }))} />
            <NativeSelect aria-label="List" value={draft.folder ?? ''} onChange={(e) => set({ folder: e.target.value || null })} placeholder="Any list" disabled={!draft.space} options={folders.map((f) => ({ value: f.id, label: f.name }))} />
          </div>
        </Section>
      ) : null}
      <div className="sticky -bottom-4 -mx-4 -mb-4 flex justify-between gap-2 border-t border-white/[0.1] bg-menu px-4 pb-4 pt-3">
        <Button variant="ghost" size="sm" onClick={() => apply(cleared)}>
          Clear all
        </Button>
        <Button variant="primary" size="sm" onClick={() => apply(draft)}>
          Apply filters
        </Button>
      </div>
    </Popover>
  )
}
