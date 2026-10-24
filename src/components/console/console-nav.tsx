'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export type ConsoleLink = { href: string; label: string; exact?: boolean; badge?: number }

/** The Console's section links (filtered by role on the server). */
export function ConsoleNav({ links }: { links: ConsoleLink[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Console" className="flex h-[33px] max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-control p-[4.5px]">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(`${l.href}/`)
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cn('press inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors duration-150', active ? 'bg-control-active text-white' : 'text-white hover:bg-white/[0.05]')}
          >
            {l.label}
            {l.badge ? <span className="rounded-full bg-[#F64A45] px-1.5 text-[11px] font-semibold leading-4 text-white tabular-nums">{l.badge}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}
