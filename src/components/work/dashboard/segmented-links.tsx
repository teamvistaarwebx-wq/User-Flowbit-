import Link from 'next/link'
import { cn } from '@/lib/utils'

export type SegmentLink = { href: string; label: string; active: boolean; title?: string }

/** The Figma segmented control as links (Assign to me: All task / Done / Due): #171717 track, #313131 active. */
export function SegmentedLinks({ items, className, label }: { items: SegmentLink[]; className?: string; label: string }) {
  return (
    <nav aria-label={label} className={cn('flex h-[33px] w-fit items-center gap-0.5 rounded-full bg-control p-[4.5px]', className)}>
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          scroll={false}
          title={t.title}
          aria-current={t.active ? 'page' : undefined}
          className={cn('press inline-flex h-6 items-center whitespace-nowrap rounded-full px-3 text-sm transition-colors duration-150', t.active ? 'bg-control-active text-white' : 'text-white hover:bg-white/[0.05]')}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
