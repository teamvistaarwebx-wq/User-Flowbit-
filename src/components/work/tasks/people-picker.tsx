'use client'

import { Check, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { play } from '@/lib/sound'
import { Avatar } from '@/components/ui/avatar'
import { fieldBase } from '@/components/ui/input'
import { Popover } from '@/components/ui/popover'
import type { Person } from './types'

export type PeoplePickerProps = {
  people: Person[]
  value: string[]
  onChange: (ids: string[]) => void
  trigger: ReactNode
  /** Pick one person (closes on pick). */
  single?: boolean
  /** Ids shown first (assignees, creator, project people). */
  priorityIds?: string[]
  emptyLabel?: string
  align?: 'start' | 'center' | 'end'
  /** Called when the popover opens or closes (e.g. save picks on close). */
  onOpenChange?: (open: boolean) => void
}

/** Searchable member picker in a popover (assignees, sharing, members). */
export function PeoplePicker({ people, value, onChange, trigger, single, priorityIds = [], emptyLabel = 'No one matches', align = 'start', onOpenChange }: PeoplePickerProps) {
  const [open, setOpenState] = useState(false)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    if (!next) setQuery('')
    onOpenChange?.(next)
  }
  const [query, setQuery] = useState('')
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.title ?? '').toLowerCase().includes(q))
    const rank = (p: Person) => (value.includes(p.id) ? 0 : priorityIds.includes(p.id) ? 1 : 2)
    return [...matches].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }, [people, query, value, priorityIds])

  const pick = (id: string) => {
    play('toggle')
    if (single) {
      onChange([id])
      setOpen(false)
      return
    }
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  return (
    <Popover modal open={open} onOpenChange={setOpen} trigger={trigger} align={align} className="w-80 p-2">
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#AAA9AB]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          aria-label="Search people"
          className={cn(fieldBase, 'h-9 rounded-full pl-8 pr-3 text-sm')}
        />
      </div>
      <ul className="max-h-72 overflow-y-auto scroll-fade-y" role="listbox" aria-multiselectable={!single}>
        {list.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-fg-2">{emptyLabel}</li> : null}
        {list.map((p) => {
          const selected = value.includes(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(p.id)}
                className={cn('flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.05]', selected && 'bg-white/[0.06]')}
              >
                <Avatar name={p.name} src={p.avatarUrl} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{p.name}</span>
                  {p.title ? <span className="block truncate text-xs text-fg-2">{p.title}</span> : null}
                </span>
                {selected ? <Check className="size-4 text-white" /> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </Popover>
  )
}
