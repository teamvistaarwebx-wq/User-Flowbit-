'use client'

import { X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { TAG_MAX } from '@/modules/work/tasks/constants'
import { play } from '@/lib/sound'
import { fieldBase } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Chip input: Enter or comma adds (trimmed, no duplicates), ✕ removes. Submits `name` as one comma-separated value. */
export function TagsInput({ value, onChange, name, placeholder = 'Add a tag and press Enter' }: { value: string[]; onChange: (tags: string[]) => void; name?: string; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const tag = raw.trim().slice(0, TAG_MAX)
    if (tag && !value.includes(tag)) {
      play('toggle')
      onChange([...value, tag])
    }
    setDraft('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }
  return (
    <div className={cn(fieldBase, 'flex min-h-10 flex-wrap items-center gap-1.5 rounded-[20px] px-3 py-1.5')}>
      {name ? <input type="hidden" name={name} value={value.join(',')} /> : null}
      {value.map((tag) => (
        <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-full bg-chip-active pl-2.5 pr-1 text-xs text-white">
          {tag}
          <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))} className="rounded-full p-0.5 hover:bg-white/10">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? '' : placeholder}
        aria-label="Add tag"
        className="h-7 min-w-24 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-4 focus:outline-none"
      />
    </div>
  )
}
