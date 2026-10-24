import Link from 'next/link'
import { cn } from '@/lib/utils'

/** Server-rendered segmented links where the page decides which one is active (period / range switches), as Home's segmented control. */
export function PillLinks({ items, active, className }: { items: { key: string; href: string; label: string }[]; active: string; className?: string }) {
  return (
    <nav className={cn('flex h-[33px] w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-control p-[4.5px] scrollbar-none', className)}>
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === active ? 'page' : undefined}
          className={cn(
            'press inline-flex h-6 items-center whitespace-nowrap rounded-full px-3 text-[13px] transition-colors duration-150',
            i.key === active ? 'bg-control-active text-white' : 'text-white/75 hover:bg-white/[0.05] hover:text-white',
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
