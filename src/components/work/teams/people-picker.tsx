'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Popover } from '@/components/ui/popover'
import { fieldBase } from '@/components/ui/input'
import { play } from '@/lib/sound'
import { cn } from '@/lib/utils'

export type PickPerson = { id: string; name: string; title?: string }

type Props = {
  /** Form field; submits `${name}[]` per selected id. */
  name?: string
  people: PickPerson[]
  value?: string[]
  defaultValue?: string[]
  onChange?: (ids: string[]) => void
  placeholder?: string
  /** Ids shown as fixed (e.g. the organiser). */
  locked?: string[]
}

/** Searchable multi-select of workspace members, as avatar chips. Works in ActionForm (hidden inputs). */
export function PeoplePicker({ name, people, value, defaultValue = [], onChange, placeholder = 'Add people', locked = [] }: Props) {
  const [inner, setInner] = useState<string[]>(defaultValue)
  const [q, setQ] = useState('')
  const selected = value ?? inner
  const set = (next: string[]) => {
    if (value === undefined) setInner(next)
    onChange?.(next)
  }
  const toggle = (id: string) => {
    if (locked.includes(id)) return
    play('toggle')
    set(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const shown = people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.title?.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="space-y-2">
      {name ? selected.map((id) => <input key={id} type="hidden" name={`${name}[]`} value={id} />) : null}
      <Popover
        modal
        align="start"
        className="w-80 p-3"
        trigger={
          <button type="button" data-field={name} className={cn(fieldBase, 'flex h-10 items-center justify-between rounded-full px-4 text-left text-sm text-fg-4')}>
            {selected.length ? `${selected.length} selected` : placeholder}
            <ChevronDown className="size-4" />
          </button>
        }
      >
        <div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#AAA9AB]" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className={cn(fieldBase, 'h-9 rounded-full pl-9 pr-3 text-sm')} />
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {shown.length === 0 ? <li className="px-3 py-4 text-center text-[13px] text-fg-2">No one matches “{q}”.</li> : null}
            {shown.map((p) => {
              const on = selected.includes(p.id)
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => toggle(p.id)} disabled={locked.includes(p.id)} className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-white/85 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-60">
                    <Avatar name={p.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate">
                      {p.name}
                      {p.title ? <span className="text-xs text-fg-3"> · {p.title}</span> : null}
                    </span>
                    {on ? <Check className="size-4 text-white" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </Popover>
      {selected.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.12] bg-control pl-1 pr-2 text-xs text-white">
              <Avatar name={byId.get(id)?.name} size="xs" />
              {byId.get(id)?.name ?? 'Member'}
              {locked.includes(id) ? null : (
                <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${byId.get(id)?.name ?? 'person'}`} className="text-fg-3 transition-colors hover:text-white">
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
