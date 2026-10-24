'use client'

import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { updateTask } from '@/modules/work/tasks/actions'
import type { TaskStatus } from '@/modules/work/tasks/constants'
import { play } from '@/lib/sound'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * The row's status mark (Figma: a 15px dashed white circle for "to do"). Clicking marks the task done, with
 * Undo in the toast; a done task shows a filled teal check and reopens on click.
 */
export function QuickComplete({ id, title, status, disabled }: { id: string; title: string; status: TaskStatus; disabled?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(status === 'done')

  const run = () => {
    const next: TaskStatus = done ? 'todo' : 'done'
    setDone(!done)
    play('toggle', { on: !done })
    start(async () => {
      const res = await updateTask({ id, status: next })
      if (!res.ok) {
        setDone(done)
        toast.error(res.error)
        return
      }
      const previous = (res.data?.previous ?? status) as TaskStatus
      toast.success(res.message ?? `Task '${title}' moved to ${next === 'done' ? 'Done' : 'To do'}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            const undo = await updateTask({ id, status: previous })
            if (!undo.ok) toast.error(undo.error)
            router.refresh()
          },
        },
      })
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reopen ${title}` : `Mark ${title} done`}
      disabled={disabled || pending}
      onClick={run}
      className={cn('group flex size-[18px] shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50', done ? 'bg-success text-white' : 'text-white')}
    >
      {done ? (
        <Check className="size-3" strokeWidth={3} />
      ) : (
        <svg viewBox="0 0 16 16" className="size-[15px] transition-transform duration-150 group-hover:rotate-45" aria-hidden>
          <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.6 2.7" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}
