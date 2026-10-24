import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Onboarding chip style: #56397D when on; the dark control pill with a translucent hairline when off. */
export const chipClass = (active: boolean) =>
  cn(
    'press inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150 [&_svg]:size-3.5 [&_svg]:shrink-0',
    active ? 'bg-chip-active text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]' : 'bg-control text-white/85 ring-1 ring-inset ring-white/[0.12] hover:bg-white/[0.06] hover:text-white',
  )

export type ChipLink = { href: string; label: ReactNode; active: boolean; icon?: ReactNode; key?: string }

/** Filter chips as links (teams, categories). Server-safe. */
export function FilterChips({ items, label, className }: { items: ChipLink[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn('flex items-center gap-2 max-sm:w-full max-sm:min-w-0 max-sm:overflow-x-auto max-sm:scrollbar-none sm:flex-wrap [&>*]:shrink-0', className)}>
      {items.map((i) => (
        <Link key={i.key ?? i.href} href={i.href} scroll={false} aria-current={i.active ? 'true' : undefined} className={chipClass(i.active)}>
          {i.icon}
          {i.label}
        </Link>
      ))}
    </nav>
  )
}

/** The Figma segmented control, shared with Orbit and Folio (components/ui/segment-links). */
export { SegmentLinks, type SegmentLink } from '@/components/ui/segment-links'
