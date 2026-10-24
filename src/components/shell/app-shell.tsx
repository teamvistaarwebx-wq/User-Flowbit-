'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { FeatureKey, Permission, ProductKey } from '@/lib/catalog'
import { setSoundLocal } from '@/lib/sound'
import { Sheet } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ShellData } from './data'
import { LimitPrompt } from '@/components/subscription/limit-prompt'
import { ProductTour } from '@/components/activation/product-tour'
import { Banners } from './banners'
import { CommandPalette } from './command-palette'
import { previewHref } from './nav-model'
import { BottomBar, Rail } from './rail'
import { ShellProvider } from './shell-context'
import { SidePanel, SidePanelContent } from './side-panel'
import { TopBar } from './top-bar'
import { WorkspaceLogo } from './workspace-logo'

/**
 * The signed-in frame, as the Figma dashboard: the logo row (the workspace's own logo, else Flowbit's), the gradient rail, the hairline-divided side
 * panel and an outlined main panel whose content scrolls under a fixed top bar. One plum glow lights the top.
 * Phones get a top bar, a bottom bar and the side panel in a sheet.
 */
export function AppShell({ data, children, panel }: { data: ShellData; children: ReactNode; panel?: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  useEffect(() => {
    setSoundLocal(data.user.sound)
    document.documentElement.dataset.reducedMotion = String(data.user.motion === 'reduce')
    document.documentElement.dataset.motion = data.user.motion
  }, [data.user.sound, data.user.motion])

  useEffect(() => setMenuOpen(false), [pathname])

  const openCommand = useCallback(() => setCommandOpen(true), [])

  const api = useMemo(() => {
    const perms = new Set(data.permissions)
    const has = (p: ProductKey) => data.products[p].entitled && data.products[p].enabled
    return {
      ...data,
      can: (perm?: Permission) => !perm || perms.has(perm),
      has,
      hasFeature: (feature?: FeatureKey) => !feature || (feature === 'muster.payroll' ? data.features.payroll : has(feature.split('.')[0] as ProductKey)),
      openUpgrade: (product: ProductKey) => router.push(previewHref(product)),
      openCommand,
      absoluteUrl: (path: string) => `${data.appUrl}${path.startsWith('/') ? path : `/${path}`}`,
    }
  }, [data, openCommand, router])

  return (
    <ShellProvider value={api}>
      <TooltipProvider>
        {/* Workspace brand colours: built by lib/brand-theme from validated hex values only. */}
        {data.themeCss ? <style dangerouslySetInnerHTML={{ __html: data.themeCss }} /> : null}
        <div data-avatar-style={data.avatarStyle} className="relative min-h-dvh bg-bg md:h-dvh md:overflow-hidden">
          {/* The one light source: a plum glow behind the top of the content, wandering slowly (DESIGN 3.4). */}
          <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[760px] overflow-hidden">
            <div className="absolute -inset-x-[6%] top-0 h-full animate-[glow-wander_40s_var(--ease-in-out)_infinite] bg-[radial-gradient(48%_70%_at_58%_0%,rgba(58,40,62,0.85)_0%,rgba(42,32,44,0.6)_35%,rgba(23,23,23,0)_75%)]" />
          </div>

          {/* Logo row (y 0-89) with the rule that runs under it and the top bar. */}
          <Link href="/app" aria-label={`${data.org.logoUrl ? data.org.name : 'Flowbit'} home`} className="fixed left-5 top-[23px] z-40 hidden lg:block">
            <WorkspaceLogo org={data.org} size={36} />
          </Link>
          <Link href="/app" aria-label={`${data.org.logoUrl ? data.org.name : 'Flowbit'} home`} className="fixed left-[36px] top-[28px] z-40 hidden md:block lg:hidden">
            <WorkspaceLogo org={data.org} size={34} showText={false} />
          </Link>
          <div aria-hidden className="fixed left-[97px] right-0 top-[89px] z-30 hidden h-px bg-line md:block" />
          {/* The main panel: an outline that starts at the top bar and runs off the right and bottom edges. */}
          <div aria-hidden className="pointer-events-none fixed -bottom-px -right-px left-[101px] top-[21px] z-30 hidden rounded-tl-[10px] border border-[#4d4d4d] md:block lg:left-[376px]" />

          <TopBar onMenu={() => setMenuOpen(true)} />
          <Rail />
          <SidePanel />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen} side="left" className="w-[288px] p-0 [&>div]:p-0">
            <SidePanelContent onNavigate={() => setMenuOpen(false)} />
          </Sheet>

          <main id="main" className="relative z-10 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))] md:fixed md:bottom-0 md:left-[102px] md:right-0 md:top-[90px] md:overflow-y-auto md:overscroll-contain md:pb-10 md:pt-0 lg:left-[377px]">
            <Banners />
            <div className="px-4 py-5 sm:px-6 md:pl-7 md:pr-8 md:pt-[15px] lg:pr-[33px]">{children}</div>
          </main>
          <BottomBar />
          {panel}
          <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
          <LimitPrompt />
          <ProductTour />
        </div>
      </TooltipProvider>
    </ShellProvider>
  )
}
