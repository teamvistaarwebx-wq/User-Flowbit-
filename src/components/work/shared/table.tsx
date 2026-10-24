import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Table pieces copied from Home's "Assign to me" so every Work list reads as its sibling: a 33px header row
 * between #535353 rules with a 15px outline icon before each label, then plain rows with no zebra and no
 * borders. Hover lifts the row to white 4%; a selected row gets white 6% and a 2px white inset on the left.
 */
export function Th({ icon, children, className, align = 'left' }: { icon?: ReactNode; children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th scope="col" className={cn('h-[33px] whitespace-nowrap px-3 text-[13px] font-normal text-white', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left', className)}>
      <span className={cn('inline-flex items-center gap-1.5 [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:stroke-[1.5]', align === 'right' && 'flex-row-reverse')}>
        {icon}
        {children}
      </span>
    </th>
  )
}

/** Header row: the two #535353 rules. */
export const HEAD_ROW = 'border-y border-line'

/** A body row (pass `selected` for the bulk-selection look). */
export const rowClass = (selected?: boolean) =>
  cn('group transition-colors duration-150 hover:bg-white/[0.04]', selected && 'bg-white/[0.06] shadow-[inset_2px_0_0_rgba(255,255,255,0.6)] hover:bg-white/[0.06]')

/** Card header in the dashboard's label style: icon + UPPERCASE 14/600, a 13/400 grey line under it, actions right. */
export function PanelHeader({ icon, title, subtitle, actions, className }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]">
          {icon}
          <span className="min-w-0 truncate">{title}</span>
        </h2>
        {subtitle ? <p className="mt-1 text-[13px] text-[#959596]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
