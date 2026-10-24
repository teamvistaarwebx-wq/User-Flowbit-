import Link from 'next/link'
import { cn } from '@/lib/utils'

export type FilterPill = { href: string; label: string; active: boolean; count?: number }

/**
 * Filters as links in the Figma segmented control ("All task / Done / Due"): a #171717 track, the active segment
 * #313131. The server decides which one is active (works with several filters at once).
 */
export function FilterPills({ items, className, label = 'Filter' }: { items: FilterPill[]; className?: string; label?: string }) {
  return (
    <nav aria-label={label} className={cn('flex h-[33px] w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-control p-[4.5px] scrollbar-none', className)}>
      {items.map((item) => (
        <Link
          key={item.href + item.label}
          href={item.href}
          scroll={false}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'press inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-colors duration-150',
            item.active ? 'bg-control-active text-white' : 'text-white hover:bg-white/[0.05]',
          )}
        >
          {item.label}
          {item.count !== undefined ? <span className={cn('text-xs tabular-nums', item.active ? 'text-white/70' : 'text-fg-3')}>{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  )
}
