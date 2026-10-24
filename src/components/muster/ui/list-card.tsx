import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The dashboard's "Assign to me" card, for every list in Muster: the opaque table surface (radius 12, lit left
 * edge), an icon + UPPERCASE label with a one-line subtitle, controls at the right, then a body that starts
 * on a 1px rule. Put a `DataTable` inside with `className={LIST_FLUSH}` so it drops its own card.
 */
export function ListCard({ label, icon, description, actions, toolbar, children, footer, className, bodyClassName, id }: { label: ReactNode; icon?: ReactNode; description?: ReactNode; actions?: ReactNode; toolbar?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={cn('card-table flex min-w-0 flex-col animate-fade-in', className)}>
      <header className="flex flex-col gap-3 px-5 pb-4 pt-[17px] sm:px-[23px] lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white [&_svg]:size-4 [&_svg]:shrink-0">
            {icon}
            <span className="min-w-0">{label}</span>
          </h2>
          {description ? <p className="mt-1 text-[13px] text-[#959596]">{description}</p> : null}
        </div>
        {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">{actions}</div> : null}
      </header>
      {toolbar ? <div className="flex flex-wrap items-center gap-2 px-5 pb-4 sm:px-[23px]">{toolbar}</div> : null}
      <div className={cn('min-w-0 flex-1 border-t border-line', bodyClassName)}>{children}</div>
      {footer ? <div className="border-t border-line px-5 py-3 sm:px-[23px]">{footer}</div> : null}
    </section>
  )
}

/** Strips a `DataTable` (or any `card-table`) of its own surface so it can sit inside a `ListCard`. */
export const LIST_FLUSH = 'rounded-none bg-transparent before:hidden'

/** A list inside a ListCard: rows without borders or zebra, a soft hover (DESIGN 12). */
export function ListRows({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('py-1.5', className)}>{children}</ul>
}

export function ListRow({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn('flex min-h-11 flex-wrap items-center gap-3 px-5 py-2.5 text-sm transition-colors duration-150 hover:bg-white/[0.04] sm:px-[23px]', className)}>{children}</li>
}

/** Class names for hand-built tables, matching DataTable: a ruled 33px header row and 44px rows. */
export const TABLE = {
  table: 'w-full border-collapse text-[13px] max-sm:[&_td]:whitespace-nowrap',
  headRow: 'border-b border-line',
  th: 'h-[33px] whitespace-nowrap px-4 text-left text-sm font-normal text-fg',
  row: 'transition-colors duration-150 hover:bg-white/[0.04]',
  td: 'h-11 px-4 align-middle',
} as const
