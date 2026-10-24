import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/status'
import { TONE_TEXT } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

export type Figure = { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; id?: string }

/**
 * Key figures in a row divided by hairlines, set like the Project overview legend: a 14/400 label over a
 * 24/600 value. Colour only where the number means something (loss of pay, overdue).
 */
export function Figures({ items, className }: { items: Figure[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:flex-wrap sm:gap-0 sm:[&>*+*]:border-l sm:[&>*+*]:border-white/[0.12]', className)}>
      {items.map((f, i) => (
        <div key={f.id ?? (typeof f.label === 'string' ? f.label : i)} className="min-w-0 sm:min-w-[120px] sm:flex-1 sm:px-5 sm:first:pl-0 sm:last:pr-0">
          <dt className="truncate text-sm text-white/80">{f.label}</dt>
          <dd className={cn('mt-1 truncate text-2xl font-semibold leading-[30px] tabular-nums', f.tone ? TONE_TEXT[f.tone] : 'text-white')}>{f.value}</dd>
          {f.hint ? <dd className="mt-0.5 truncate text-xs text-fg-2">{f.hint}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

/** Figures on a glass card, for the strip under a page header (DESIGN 12, "hero strip"). */
export function FiguresCard({ items, className }: { items: Figure[]; className?: string }) {
  return (
    <Card className={cn('px-5 py-4 animate-fade-in', className)}>
      <Figures items={items} />
    </Card>
  )
}
