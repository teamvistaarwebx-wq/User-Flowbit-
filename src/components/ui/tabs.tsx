'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import * as RT from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type LinkTab = { href: string; label: ReactNode; count?: number; icon?: ReactNode; /** Match exactly (default) or by prefix. */ prefix?: boolean }

/** Figma segmented control: a #171717 track, the active segment #313131, labels white 14/400. */
const trackClass = 'flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-control p-1 scrollbar-none'

const tabClass = (active: boolean) =>
  cn(
    'press relative inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors duration-150 [&_svg]:size-4',
    active ? 'bg-control-active text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-fg hover:bg-white/[0.05]',
  )

const countClass = (active: boolean) => cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/[0.12] text-white' : 'text-fg-3')

/**
 * Route tabs (detail pages, list views). Active when the pathname (and any
 * query in the tab href) matches. Works for '?tab=x' and '/sub-route' styles.
 */
export function LinkTabs({ tabs, className }: { tabs: LinkTab[]; className?: string }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const isActive = (t: LinkTab) => {
    const [path, query] = t.href.split('?')
    const pathOk = t.prefix ? pathname === path || pathname.startsWith(`${path}/`) : pathname === path
    if (!pathOk) return false
    if (!query) return !tabs.some((o) => o !== t && o.href.startsWith(`${path}?`) && matchesQuery(o.href, search))
    return matchesQuery(t.href, search)
  }
  return (
    <nav className={cn(trackClass, className)}>
      {tabs.map((t) => {
        const active = isActive(t)
        return (
          <Link key={t.href} href={t.href} className={tabClass(active)} aria-current={active ? 'page' : undefined}>
            {t.icon}
            {t.label}
            {t.count !== undefined ? <span className={countClass(active)}>{t.count}</span> : null}
          </Link>
        )
      })}
    </nav>
  )
}

function matchesQuery(href: string, search: URLSearchParams): boolean {
  const query = href.split('?')[1]
  if (!query) return false
  return [...new URLSearchParams(query).entries()].every(([k, v]) => search.get(k) === v)
}

export type ClientTab = { value: string; label: ReactNode; content: ReactNode; count?: number }

/** In-page tabs (no route change). */
export function Tabs({ items, defaultValue, value, onValueChange, className }: { items: ClientTab[]; defaultValue?: string; value?: string; onValueChange?: (v: string) => void; className?: string }) {
  return (
    <RT.Root
      defaultValue={defaultValue ?? items[0]?.value}
      value={value}
      onValueChange={onValueChange}
      className={className}
    >
      <RT.List className={cn(trackClass, 'mb-4')}>
        {items.map((t) => (
          <RT.Trigger key={t.value} value={t.value} className="group press inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm text-fg transition-colors hover:bg-white/[0.05] data-[state=active]:bg-control-active data-[state=active]:text-white">
            {t.label}
            {t.count !== undefined ? <span className="rounded-full px-1.5 text-xs tabular-nums text-fg-3 group-data-[state=active]:bg-white/[0.12] group-data-[state=active]:text-white">{t.count}</span> : null}
          </RT.Trigger>
        ))}
      </RT.List>
      {items.map((t) => (
        <RT.Content key={t.value} value={t.value} className="animate-fade-in focus:outline-none">
          {t.content}
        </RT.Content>
      ))}
    </RT.Root>
  )
}

/** Compact segmented control (view switchers like List | Board | Calendar). Silent: switching a view is navigation, not an action. */
export function Segmented<T extends string>({ options, value, onChange, className }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="radiogroup" className={cn('inline-flex gap-0.5 rounded-full bg-control p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(tabClass(o.value === value), 'h-[26px] px-3 text-[13px]')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
