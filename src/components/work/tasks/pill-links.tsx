import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PillLink = { href: string; label: ReactNode; active: boolean; count?: number; icon?: ReactNode }

/**
 * Server-rendered quick views whose active state the page decides (query-heavy pages like Tasks), drawn as
 * Home's segmented control: a #171717 track with the active segment in #313131. No glow, no colour.
 */
export function PillLinks({ items, className }: { items: PillLink[]; className?: string }) {
  return (
    <nav className={cn('flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-control p-[4.5px] scrollbar-none', className)}>
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          scroll={false}
          aria-current={t.active ? 'page' : undefined}
          className={cn(
            'press inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors duration-150 [&_svg]:size-3.5',
            t.active ? 'bg-control-active text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-white/75 hover:bg-white/[0.05] hover:text-white',
          )}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined ? <span className={cn('text-xs tabular-nums', t.active ? 'text-white/80' : 'text-fg-3')}>{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  )
}
