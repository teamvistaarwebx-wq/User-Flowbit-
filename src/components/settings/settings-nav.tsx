'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { IconName } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/icon'

export type SettingsLink = { href: string; label: string; icon: IconName; /** The side-panel section, shown as a small label before its first pill. */ section?: string }

/**
 * Settings sections as one scrolling segmented control, for screens where the shell's side panel (which lists
 * the same links) is hidden.
 */
export function SettingsNav({ links }: { links: SettingsLink[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Settings sections" className="-mx-4 mb-6 overflow-x-auto px-4 pb-1 scrollbar-none lg:hidden">
      <div className="flex w-max items-center gap-0.5 rounded-full bg-control p-[4.5px]">
        {links.map((link, i) => {
          const active = pathname === link.href
          const startsSection = link.section && link.section !== links[i - 1]?.section
          return (
            <Fragment key={link.href}>
              {startsSection ? <span className="shrink-0 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-3 first:pl-2.5">{link.section}</span> : null}
            <Link
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors duration-150',
                active ? 'bg-control-active text-white' : 'text-white/80 hover:bg-white/[0.05] hover:text-white',
              )}
            >
              <Icon name={link.icon} className={cn('size-4', active ? 'text-white' : 'text-icon-muted')} />
              {link.label}
            </Link>
            </Fragment>
          )
        })}
      </div>
    </nav>
  )
}
