'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Component, Plus, Search, UsersRound } from 'lucide-react'
import { isSharedPanelPath, panelFor, type PanelKey, type SideSection } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/icon'
import { CheckInWidget } from './check-in-widget'
import { sideSections } from './nav-model'
import { useShell } from './shell-context'
import { WorkspaceSwitcher } from './workspace-switcher'

/** The link that best matches the path: exact, else the longest prefix. */
function activeHref(pathname: string, hrefs: string[]): string | undefined {
  const paths = hrefs.map((h) => h.split('?')[0])
  const exact = paths.find((p) => p === pathname)
  if (exact) return exact
  return paths.filter((p) => pathname.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0]
}

/** Figma side-panel item: a 14px muted icon at the label's left, 14/400 white text, 26px pitch. */
const linkCls = (active: boolean) =>
  cn('flex h-[26px] items-center gap-[9px] rounded-[6px] px-2 text-sm transition-colors', active ? 'bg-white/[0.07] text-white' : 'text-white/90 hover:bg-white/[0.04] hover:text-white')

function SectionBlock({ section, current, onNavigate }: { section: SideSection; current?: string; onNavigate?: () => void }) {
  const shell = useShell()
  const pathname = usePathname()
  const dynamicItems = section.dynamic === 'projects' ? shell.projects : section.dynamic === 'teams' ? shell.teams : []
  const base = section.dynamic === 'projects' ? '/app/work/projects' : '/app/work/teams'
  const DynamicIcon = section.dynamic === 'projects' ? Component : UsersRound
  const quiet = 'flex h-[26px] items-center px-2 text-[13px] text-fg-2 transition-colors hover:text-white'

  return (
    <div className="mb-[19px] last:mb-3">
      <div className="mb-1.5 flex items-center justify-between pl-2 pr-1">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-white">{section.label}</span>
        {section.addHref && shell.can(section.addPerm) ? (
          <Link href={section.addHref} className="flex size-6 items-center justify-center rounded-full text-white transition-colors hover:bg-white/[0.08]" aria-label={`${section.label}: add`}>
            <Plus className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {section.dynamic ? (
        dynamicItems.length ? (
          <ul>
            {dynamicItems.map((item) => {
              const href = `${base}/${item.id}`
              return (
                <li key={item.id}>
                  <Link href={href} onClick={onNavigate} className={linkCls(pathname.startsWith(href))}>
                    <DynamicIcon aria-hidden className="size-3.5 shrink-0 text-icon-muted" strokeWidth={1.5} />
                    <span className="truncate">{item.name}</span>
                  </Link>
                </li>
              )
            })}
            <li>
              <Link href={base} onClick={onNavigate} className={quiet}>
                View all
              </Link>
            </li>
          </ul>
        ) : (
          <Link href={base} onClick={onNavigate} className={quiet}>
            {section.dynamic === 'projects' ? 'No projects yet. Create one' : 'No teams yet. Create one'}
          </Link>
        )
      ) : (
        <ul>
          {section.links?.map((link) => {
            const active = current === link.href.split('?')[0]
            return (
              <li key={link.href}>
                <Link href={link.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={linkCls(active)}>
                  <Icon name={link.icon} size={14} strokeWidth={1.5} className="shrink-0 text-icon-muted" />
                  <span className="truncate">{link.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * The panel to show. Shared pages (Clients, WhatsApp) keep the product panel the member was last on, or the
 * one named by `?from=` (the Orbit and Folio side links carry it), instead of falling back to Work. An import
 * opened from an HR page (`?from=people`) keeps Muster's panel.
 */
function useSidePanel(pathname: string): PanelKey {
  const from = useSearchParams().get('from')
  const own = panelFor(pathname)
  const [last, setLast] = useState<PanelKey>(own)
  // Remember the panel of every non-shared page (derived state, updated during render).
  if (!isSharedPanelPath(pathname) && last !== own) setLast(own)
  const fromPanel = panelFor(pathname, from)
  return fromPanel !== own ? fromPanel : panelFor(pathname, last)
}

/**
 * Side panel content (Figma, 274 wide): workspace row, a hairline, the search pill, the contextual sections,
 * then a hairline and the check-in card right under them. Long panels scroll; the check-in stays reachable.
 */
export function SidePanelContent({ onNavigate }: { onNavigate?: () => void }) {
  const shell = useShell()
  const pathname = usePathname()
  const sections = sideSections(useSidePanel(pathname), shell)
  // Matched across all sections: per section, General (/app/settings) would also light up on /app/settings/profile.
  const current = activeHref(pathname, sections.flatMap((s) => s.links?.map((l) => l.href) ?? []))
  const sectionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    sectionsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
  }, [current])
  return (
    <div className="flex h-full flex-col short:overflow-y-auto short:overscroll-contain short:scrollbar-none">
      <div className="flex h-14 shrink-0 items-center px-2.5">
        <WorkspaceSwitcher />
      </div>
      {/* The section box: a rule that turns up into the main panel's edge with an 8px corner. */}
      <div className="flex min-h-0 flex-1 flex-col rounded-tr-[8px] border-r border-t border-line">
        <div className="shrink-0 px-[13px] pb-[14px] pt-[22px] short:pt-3">
          <button
            type="button"
            onClick={() => {
              onNavigate?.()
              shell.openCommand()
            }}
            className="flex h-10 w-full items-center gap-2.5 rounded-full border border-[#535153] px-3 text-sm text-fg-4 transition-colors hover:border-white/30 hover:text-fg-2"
          >
            <Search className="size-[18px] text-[#AAA9AB]" strokeWidth={1.5} />
            <span className="flex-1 text-left">Search everything</span>
            <kbd className="rounded-[5px] border border-white/[0.12] px-1.5 py-px font-sans text-[11px] text-fg-3">⌘K</kbd>
          </button>
        </div>
        <div ref={sectionsRef} className="min-h-0 shrink overflow-y-auto overscroll-contain px-3.5 pt-1.5 scrollbar-none scroll-fade-y short:shrink-0 short:overflow-visible short:[mask-image:none]">
          {sections.map((s) => (
            <SectionBlock key={s.key} section={s} current={current} onNavigate={onNavigate} />
          ))}
        </div>
        <div className="shrink-0 border-t border-line px-[21px] pb-4 pt-[15px]">
          <CheckInWidget />
        </div>
      </div>
    </div>
  )
}

/** Desktop side panel: x 101-376 between hairlines, #1A1A1A, under the logo row. */
export function SidePanel() {
  return (
    <aside data-tour="side-panel" className="fixed bottom-0 left-[101px] top-[90px] z-20 hidden w-[276px] border-l border-line bg-panel lg:block">
      <SidePanelContent />
    </aside>
  )
}
