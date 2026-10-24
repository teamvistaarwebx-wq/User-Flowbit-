import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** One segment. Without `href` it is a static state label (shown, not clickable). */
export type SegmentLink = { href?: string; label: ReactNode; active: boolean; count?: number; icon?: ReactNode; title?: string; key?: string }

const itemClass = (active: boolean) =>
  cn(
    'press inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-colors duration-150 coarse:h-8 [&_svg]:size-3.5',
    active ? 'bg-control-active text-white' : 'text-white/85 hover:bg-white/[0.05] hover:text-white',
  )

function SegmentBody({ item }: { item: SegmentLink }) {
  return (
    <>
      {item.icon}
      {item.label}
      {item.count !== undefined ? <span className={cn('text-xs tabular-nums', item.active ? 'text-white/70' : 'text-fg-3')}>{item.count}</span> : null}
    </>
  )
}

/**
 * The Figma segmented control as links (#171717 track, #313131 active, 33px), for views and quick filters.
 * Server-safe. On touch screens the segments grow to 32px so they are easier to tap.
 */
export function SegmentLinks({ items, label, className }: { items: SegmentLink[]; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn('flex h-[33px] w-fit max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full bg-control p-[4.5px] scrollbar-none coarse:h-[41px]', className)}>
      {items.map((item, n) =>
        item.href ? (
          <Link key={item.key ?? item.href} href={item.href} scroll={false} title={item.title} aria-current={item.active ? 'page' : undefined} className={itemClass(item.active)}>
            <SegmentBody item={item} />
          </Link>
        ) : (
          <span key={item.key ?? n} title={item.title} aria-current={item.active ? 'page' : undefined} className={cn(itemClass(item.active), 'cursor-default hover:bg-transparent', item.active && 'hover:bg-control-active')}>
            <SegmentBody item={item} />
          </span>
        ),
      )}
    </nav>
  )
}
