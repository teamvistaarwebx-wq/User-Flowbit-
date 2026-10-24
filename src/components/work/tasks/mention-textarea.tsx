'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/input'
import type { Person } from './types'

const MAX_SUGGESTIONS = 6

export type MentionTextareaProps = {
  value: string
  /** New text plus the ids of people still @mentioned in it. */
  onChange: (value: string, mentionIds: string[]) => void
  people: Person[]
  /** Shown first in the dropdown (assignees, creator, project people). */
  priorityIds?: string[]
  placeholder?: string
  rows?: number
  autoFocus?: boolean
  /** ⌘/Ctrl + Enter. */
  onSubmit?: () => void
  className?: string
  'aria-label'?: string
}

/** Textarea where typing "@" offers members; picks are sent as explicit ids (the text keeps "@Name"). */
export function MentionTextarea({ value, onChange, people, priorityIds = [], placeholder, rows = 3, autoFocus, onSubmit, className, ...aria }: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [picked, setPicked] = useState<Person[]>([])
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null)
  const [active, setActive] = useState(0)

  const suggestions = useMemo(() => {
    if (!query) return []
    const q = query.text.toLowerCase()
    return people
      .filter((p) => p.active && p.name.toLowerCase().includes(q))
      .sort((a, b) => Number(priorityIds.includes(b.id)) - Number(priorityIds.includes(a.id)) || a.name.localeCompare(b.name))
      .slice(0, MAX_SUGGESTIONS)
  }, [people, priorityIds, query])

  const idsIn = (text: string, list: Person[]) => [...new Set(list.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id))]

  const update = (text: string, caret: number) => {
    const before = text.slice(0, caret)
    const match = /(^|\s)@([\p{L}\s.'-]{0,30})$/u.exec(before)
    setQuery(match && !match[2].includes('  ') ? { text: match[2], start: caret - match[2].length - 1 } : null)
    setActive(0)
    onChange(text, idsIn(text, picked))
  }

  const choose = (person: Person) => {
    if (!query) return
    const caret = ref.current?.selectionStart ?? value.length
    const text = `${value.slice(0, query.start)}@${person.name} ${value.slice(caret)}`
    const nextPicked = picked.some((p) => p.id === person.id) ? picked : [...picked, person]
    setPicked(nextPicked)
    setQuery(null)
    onChange(text, idsIn(text, nextPicked))
    requestAnimationFrame(() => {
      const pos = query.start + person.name.length + 2
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(suggestions[active])
        return
      }
      if (e.key === 'Escape') {
        setQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={aria['aria-label'] ?? placeholder}
        className={className}
        onChange={(e) => update(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {suggestions.length ? (
        <ul role="listbox" className="absolute left-2 top-full z-30 mt-1 w-64 overflow-hidden rounded-[10px] border border-white/[0.12] bg-menu p-1 shadow-pop animate-scale-in">
          {suggestions.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(p)
                }}
                className={cn('flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm', i === active ? 'bg-white/[0.07] text-white' : 'text-fg-2')}
              >
                <Avatar name={p.name} src={p.avatarUrl} size="xs" />
                <span className="truncate">{p.name}</span>
                {p.title ? <span className="ml-auto truncate text-xs text-fg-3">{p.title}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
