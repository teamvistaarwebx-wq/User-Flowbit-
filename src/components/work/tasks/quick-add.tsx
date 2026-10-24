'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type FormEvent } from 'react'
import { quickAddTask } from '@/modules/work/tasks/actions'
import { TITLE_MIN, type TaskStatus } from '@/modules/work/tasks/constants'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { parsedFields, QuickChips, useQuickParse } from './quick-parse-chips'

export type QuickAddContext = { status?: TaskStatus; dueDate?: string; projectId?: string; clientId?: string; spaceId?: string; folderId?: string; personal?: boolean; parentId?: string }

/**
 * Inline "type a title, press Enter" row. New tasks use the surrounding context (column status, filters, day);
 * dates, times, @people, #projects/lists, !clients and p1–p4 typed in the title override it (chips show what was read).
 */
export function QuickAdd({ context = {}, placeholder = 'Add a task…', className, autoFocus, onDone }: { context?: QuickAddContext; placeholder?: string; className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [pending, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const { parsed, dismiss, reset, load, warning } = useQuickParse(title, { personal: context.personal })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    const clean = parsed.title.trim()
    if (clean.length < TITLE_MIN) {
      toast.error(`Title must be at least ${TITLE_MIN} characters`)
      return
    }
    start(async () => {
      const res = await quickAddTask({ ...context, ...parsedFields(parsed), title: clean })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(res.message ?? 'Task created')
      setTitle('')
      reset()
      input.current?.focus()
      onDone?.()
      router.refresh()
    })
  }

  return (
    <div className="min-w-0">
      <form onSubmit={submit} className={cn('flex items-center gap-2 rounded-full border border-dashed border-white/[0.18] px-4 transition-[border-color,background-color,box-shadow] duration-150 hover:border-white/[0.28] focus-within:border-solid focus-within:border-white/45 focus-within:bg-white/[0.06] focus-within:shadow-[0_0_0_3px_rgba(187,98,165,0.25)]', className)}>
        <Plus className="size-4 shrink-0 text-icon-muted" />
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (!e.target.value) reset()
          }}
          onFocus={load}
          placeholder={placeholder}
          aria-label={placeholder}
          ref={input}
          // readOnly, not disabled: a disabled input drops focus, so the next title could not be typed straight away.
          readOnly={pending}
          aria-busy={pending}
          autoFocus={autoFocus}
          maxLength={200}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-4 focus:outline-none read-only:opacity-60"
        />
        {title.trim() ? <kbd className="hidden rounded-[6px] bg-control px-1.5 py-0.5 font-sans text-[11px] text-fg-2 sm:block">Enter</kbd> : null}
      </form>
      <QuickChips tokens={parsed.tokens} onDismiss={dismiss} warning={warning} />
    </div>
  )
}
