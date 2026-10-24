import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type KeyValueItem = { label: string; value: ReactNode; hidden?: boolean }

/** Definition list of label/value pairs in 1-3 columns. Empty values show an em dash. */
export function KeyValue({ items, columns = 2, className }: { items: KeyValueItem[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3', className)}>
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="text-[13px] text-fg-2">{i.label}</dt>
            <dd className="mt-0.5 break-words text-sm text-fg">{i.value === null || i.value === undefined || i.value === '' ? '—' : i.value}</dd>
          </div>
        ))}
    </dl>
  )
}
