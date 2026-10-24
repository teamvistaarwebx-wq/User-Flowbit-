import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type Fact = { icon?: ReactNode; label: ReactNode; value: ReactNode; hidden?: boolean; id?: string }

/** Project overview's fact rows: icon + label on the left, the value right-aligned, a 34px pitch. */
export function Facts({ items, className }: { items: Fact[]; className?: string }) {
  return (
    <dl className={cn('flex flex-col', className)}>
      {items
        .filter((f) => !f.hidden)
        .map((f, i) => (
          <div key={f.id ?? (typeof f.label === 'string' ? f.label : i)} className="flex min-h-[34px] items-center justify-between gap-4 py-1">
            <dt className="flex min-w-0 shrink-0 items-center gap-2 text-sm text-white [&_svg]:size-4 [&_svg]:shrink-0">
              {f.icon}
              <span className="truncate">{f.label}</span>
            </dt>
            <dd className="min-w-0 truncate text-right text-sm text-fg">{f.value === null || f.value === undefined || f.value === '' ? <span className="text-fg-3">Not set</span> : f.value}</dd>
          </div>
        ))}
    </dl>
  )
}
