'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronRight, House, Menu, Search } from 'lucide-react'
import { breadcrumbFor, canOpenPage, findPage, PRODUCTS } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/icon'
import { WorkspaceLogo } from './workspace-logo'
import { RunningTimerPill } from '@/components/work/time/running-timer-pill'
import { previewHref, previewProduct } from './nav-model'
import { NotificationBell } from './notification-bell'
import { QuickCheckIn } from './quick-check-in'
import { useShell } from './shell-context'
import { UserMenu } from './user-menu'

/**
 * Top bar inside the main panel (Figma: 68 tall, a hairline at the bottom): an 18px outline icon and the
 * breadcrumb on the left; Work's running timer, a plain bell and the white avatar on the right.
 */
export function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname()
  const shell = useShell()
  // A product preview (/app/locked?product=orbit) is not a catalog page: name the product, never "Home".
  const preview = previewProduct(pathname, useSearchParams())
  const crumbs = preview
    ? [{ label: PRODUCTS[preview].name, href: previewHref(preview) }, { label: 'Preview', href: previewHref(preview) }]
    : breadcrumbFor(pathname)
  const page = findPage(pathname)
  const product = preview ? PRODUCTS[preview] : page?.products?.length === 1 ? PRODUCTS[page.products[0]] : null

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b border-line bg-[#191719]/90 pt-[env(safe-area-inset-top)] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] backdrop-blur-xl md:left-[102px] md:top-[22px] md:h-[67px] md:border-0 md:pt-0 md:bg-transparent md:pl-7 md:pr-8 md:backdrop-blur-none lg:left-[377px] lg:pr-[33px]">
      <button type="button" onClick={onMenu} className="inline-flex size-10 items-center justify-center rounded-full text-fg hover:bg-white/[0.06] lg:hidden" aria-label="Open navigation">
        <Menu className="size-5" />
      </button>
      <Link href="/app" aria-label={`${shell.org.logoUrl ? shell.org.name : 'Flowbit'} home`} className="mr-1 md:hidden">
        <WorkspaceLogo org={shell.org} size={22} showText={false} />
      </Link>
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
        <span className="hidden shrink-0 text-fg sm:flex">{product ? <Icon name={product.icon} size={18} strokeWidth={1.5} /> : <House className="size-[18px]" strokeWidth={1.5} />}</span>
        {crumbs.map((c, i) => (
          <span key={`${c.href}-${i}`} className={i < crumbs.length - 1 ? 'hidden min-w-0 items-center gap-2 sm:flex' : 'flex min-w-0 items-center gap-2'}>
            {i > 0 ? <ChevronRight className="hidden size-3.5 shrink-0 text-fg-3 sm:block" strokeWidth={1.5} /> : null}
            {/* A parent the viewer cannot open (Folio for sales, who only has Quotes) reads as text, not a dead link. */}
            {i < crumbs.length - 1 && canOpenPage(c.href.split('?')[0], shell) ? (
              <Link href={c.href} className="truncate text-fg-2 transition-colors hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span className={cn('truncate', i < crumbs.length - 1 ? 'text-fg-2' : 'text-fg')}>{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-1">
        {shell.has('work') && shell.can('time.write') ? (
          <div className="mr-1 hidden sm:block">
            <RunningTimerPill />
          </div>
        ) : null}
        {/* Below lg the check-in card lives in the drawer; this keeps check-in one tap away. */}
        <div className="lg:hidden" data-tour="check-in">
          <QuickCheckIn />
        </div>
        <button type="button" onClick={shell.openCommand} className="inline-flex size-10 items-center justify-center rounded-full text-fg hover:bg-white/[0.06] lg:hidden" aria-label="Search">
          <Search className="size-[18px]" strokeWidth={1.5} />
        </button>
        <span data-tour="notifications" className="inline-flex"><NotificationBell /></span>
        <div className="ml-1.5">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
