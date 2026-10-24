import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/dates'

export type TimelineItem = { id: string; title: ReactNode; description?: ReactNode; at?: Date | string; icon?: ReactNode; meta?: ReactNode }

/** Vertical activity timeline (task activity, lead history, audit trail). */
export function Timeline({ items, className, empty = 'No activity yet.' }: { items: TimelineItem[]; className?: string; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-fg-3">{empty}</p>
  return (
    <ol className={cn('relative space-y-5', className)}>
      <span className="absolute bottom-2 left-[11px] top-2 w-px bg-white/[0.12]" aria-hidden />
      {items.map((item) => (
        <li key={item.id} className="relative flex gap-3 pl-0">
          <span className={cn('relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-white/[0.16] bg-panel text-fg [&_svg]:size-3')}>
            {item.icon ?? <span className="h-px w-2 bg-fg-3" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-fg">{item.title}</div>
            {item.description ? <div className="mt-0.5 text-sm text-fg-2">{item.description}</div> : null}
            <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-fg-2">
              {item.at ? <time dateTime={new Date(item.at).toISOString()}>{formatDateTime(item.at)}</time> : null}
              {item.meta}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
