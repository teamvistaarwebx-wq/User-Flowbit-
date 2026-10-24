import { Flag } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { STATUS_LABEL, type TaskStatus } from '@/modules/work/tasks/constants'
import { relativeDue } from '@/modules/work/tasks/due'
import type { RelationFlag, RelationFlags } from './types'

/** Small server-safe pieces shared by list rows, board cards and the detail page. */

/**
 * Status as an outline mark, the way Home's table starts a row (Figma: a 15px dashed white circle for "to do").
 * In progress fills half the circle, in review three quarters, blocked is struck through, done is a filled
 * teal check. Never a coloured dot.
 */
export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const label = STATUS_LABEL[status] ?? status
  return (
    <svg viewBox="0 0 16 16" role="img" aria-label={label} className={cn('size-[15px] shrink-0', className)}>
      <title>{label}</title>
      {status === 'done' ? (
        <>
          <circle cx="8" cy="8" r="7.5" fill="#08AD93" />
          <path d="M4.9 8.2l2.1 2.1 4.1-4.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : status === 'todo' ? (
        <circle cx="8" cy="8" r="6.75" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="2.6 2.2" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="8" cy="8" r="6.75" fill="none" stroke={TINT[status]} strokeWidth="1.5" />
          {status === 'in_progress' ? <path d="M8 3.6a4.4 4.4 0 0 1 0 8.8z" fill={TINT[status]} /> : null}
          {status === 'in_review' ? <path d="M8 3.6a4.4 4.4 0 1 1-4.4 4.4H8z" fill={TINT[status]} /> : null}
          {status === 'blocked' ? <path d="M4.4 11.6l7.2-7.2" stroke={TINT[status]} strokeWidth="1.5" strokeLinecap="round" /> : null}
        </>
      )}
    </svg>
  )
}

const TINT: Record<TaskStatus, string> = { todo: '#fff', in_progress: '#7473FF', in_review: '#B9A3E3', blocked: '#FAB5E8', done: '#08AD93' }

/** Figma due column: "Today" and overdue in #FF2D31, every other date in #979797. The full date is the tooltip. */
export function DueText({ dueDate, today, done, className }: { dueDate: string | null; today: string; done?: boolean; className?: string }) {
  const rel = relativeDue(dueDate, today)
  if (!rel) return <span className={cn('text-[13px] text-[#6F6D70]', className)}>No date</span>
  const urgent = !done && (rel.overdue || rel.label === 'Today')
  // A finished task is never "overdue": show the date it was due instead.
  const label = done && rel.overdue ? `Due ${formatDate(dueDate, { short: true })}` : rel.label
  return (
    <span title={dueDate ?? undefined} className={cn('whitespace-nowrap text-[13px] tabular-nums', urgent ? 'text-[#FF2D31]' : 'text-[#979797]', className)}>
      {label}
    </span>
  )
}

/** "2/5" counter (subtasks or checklist): a quiet #171717 pill; it turns teal when everything is done. */
export function CountChip({ done, total, label }: { done: number; total: number; label: string }) {
  if (!total) return null
  return (
    <span title={label} className={cn('inline-flex h-5 items-center rounded-full bg-control px-2 text-[11px] font-medium tabular-nums', done === total ? 'text-[#2DCBAF]' : 'text-fg-2')}>
      {done}/{total}
    </span>
  )
}

/** Project code, as a quiet #171717 pill. */
export function ProjectChip({ code, name }: { code: string; name?: string }) {
  return (
    <span title={name} className="inline-flex h-5 items-center rounded-full bg-control px-2 text-[11px] font-medium tracking-[0.02em] text-fg-2">
      {code}
    </span>
  )
}

const FLAG_COLOR: Record<'blockedBy' | 'blocking', string> = { blockedBy: 'text-orange', blocking: 'text-[#FF4540]' }
const FLAG_TEXT: Record<'blockedBy' | 'blocking', Record<Exclude<RelationFlag, null>, string>> = {
  blockedBy: { open: 'Waiting on another task', clear: 'Its blockers are done' },
  blocking: { open: 'Holding up another task', clear: 'No longer blocking' },
}

/** Relation flags on a card: orange while waiting on a task, red while holding one up, green once the blocker is done. */
export function RelationFlagMarks({ flags }: { flags: RelationFlags }) {
  const marks = (['blockedBy', 'blocking'] as const).filter((k) => flags[k])
  if (!marks.length) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {marks.map((k) => {
        const state = flags[k] as Exclude<RelationFlag, null>
        const label = FLAG_TEXT[k][state]
        return (
          <span key={k} title={label} role="img" aria-label={label} className={cn('inline-flex', state === 'clear' ? 'text-[#2DCBAF]' : FLAG_COLOR[k])}>
            <Flag className="size-3.5" fill="currentColor" fillOpacity={0.25} />
          </span>
        )
      })}
    </span>
  )
}
