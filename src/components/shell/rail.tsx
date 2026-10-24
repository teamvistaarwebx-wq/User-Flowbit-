'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Box, ChartNoAxesColumn, CircleDashed, CirclePlus, CircleUserRound, Component, House, ListChecks, Lock, Orbit, ReceiptIndianRupee, Settings, UsersRound, Video, type LucideIcon } from 'lucide-react'
import { PRODUCT_DESCRIPTOR, productLabel, railItemActive, type ProductKey } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/ui/icon'
import { ArcMark } from '@/components/ui/logo'
import { useShell } from './shell-context'
import { previewHref, previewProduct, previewRailKey, railBottom, railTop, type RailEntry } from './nav-model'

/** Product the locked rail item belongs to (for its preview page). */
const productOf = (entry: RailEntry): ProductKey => entry.products?.[0] ?? 'work'

/** The Figma rail's glyphs (outline, 1.5px); anything else falls back to the catalog icon. */
const RAIL_ICONS: Record<string, LucideIcon> = {
  home: House, tasks: ListChecks, spaces: CircleDashed, team: UsersRound, project: Component, client: CircleUserRound,
  meeting: Video, reports: ChartNoAxesColumn, hr: Box, orbit: Orbit, folio: ReceiptIndianRupee, invite: CirclePlus, settings: Settings,
}

/** Products sit in their own group under the Work items, after a divider (Figma: HR below Reports). */
const PRODUCT_KEYS = new Set(['hr', 'orbit', 'folio'])
/** Home and Arc sit above the Work group, which gets its own caption. */
const GENERAL_KEYS = new Set(['home', 'arc'])

/** The rail item's full name: "Muster · HR" for products, else its label. */
const fullName = (entry: RailEntry) => (entry.product ? productLabel(entry.product) : entry.label)

/** Small caption over a group of rail items (desktop rail only). */
const GroupCaption = ({ children }: { children: string }) => (
  <span aria-hidden className="mx-auto mt-2 block w-full shrink-0 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60 rail-short:mt-1 rail-tiny:sr-only">
    {children}
  </span>
)

function RailGlyph({ entry }: { entry: RailEntry }) {
  const Glyph = RAIL_ICONS[entry.key]
  return Glyph ? <Glyph aria-hidden className="size-6 text-white" strokeWidth={1.5} /> : <Icon name={entry.icon} size={24} strokeWidth={1.5} className="text-white" />
}

/** Key of the rail item to highlight on a product preview (/app/locked?product=…), which matches no item's path. */
function usePreviewKey(entries: RailEntry[]): string | undefined {
  return previewRailKey(entries, previewProduct(usePathname(), useSearchParams()))
}

function RailButton({ entry, compact, previewActive }: { entry: RailEntry; compact?: boolean; previewActive?: boolean }) {
  const pathname = usePathname()
  const active = previewActive || railItemActive(entry, pathname)
  const ref = useRef<HTMLElement | null>(null)
  // On short screens the rail scrolls: keep the current product in view (HR, Orbit, Folio sit low).
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])
  const arc = entry.special === 'arc'
  const inner = (
    <>
      {/* Active: a white tab flush with the rail's left edge, 18 x 49, round on the right only. */}
      {active && !compact ? <span aria-hidden className="absolute left-0 top-1/2 h-[49px] w-[18px] -translate-y-1/2 rounded-r-[6px] bg-white rail-short:h-10 rail-short:w-[14px] rail-tiny:h-8" /> : null}
      {active && compact ? <span aria-hidden className="absolute left-1/2 top-0 h-[3px] w-6 -translate-x-1/2 rounded-b-[3px] bg-white" /> : null}
      <span
        className={cn(
          'relative flex items-center justify-center transition-transform duration-150 group-hover:-translate-y-px',
          arc ? 'size-12 rounded-[10px] bg-[#F5E8F2] rail-short:size-10' : 'size-6',
          arc && compact && 'size-8 rounded-[8px]',
        )}
      >
        {arc ? <ArcMark size={compact ? 16 : 22} /> : <RailGlyph entry={entry} />}
        {entry.state === 'locked' ? (
          <span className="absolute -right-2 -top-1.5 flex size-4 items-center justify-center rounded-full bg-[#2a1458] ring-1 ring-white/30">
            <Lock className="size-2.5 text-white" strokeWidth={2} />
          </span>
        ) : null}
      </span>
      <span className={cn('text-white', compact ? 'mt-1 text-[11px] leading-none' : 'mt-[7px] text-[13px] leading-4 rail-short:mt-1 rail-short:text-xs rail-tiny:sr-only')}>{entry.label}</span>
      {entry.product && !compact ? <span className="text-[11px] leading-4 text-white/60 rail-short:sr-only">{PRODUCT_DESCRIPTOR[entry.product]}</span> : null}
    </>
  )
  const classes = cn('group relative flex shrink-0 flex-col items-center transition-opacity active:scale-[0.97]', compact ? 'w-16 py-1.5' : 'w-full py-[11px] rail-short:py-1', entry.state === 'locked' ? 'opacity-70 hover:opacity-100' : 'opacity-95 hover:opacity-100')
  const setRef = (el: HTMLAnchorElement | null) => {
    ref.current = el
  }
  if (entry.state === 'locked') {
    return (
      <Link ref={setRef} href={previewHref(productOf(entry))} className={classes} aria-label={`${fullName(entry)}: preview, not in your plan`} title={`${fullName(entry)} (preview)`}>
        {inner}
      </Link>
    )
  }
  return (
    <Link ref={setRef} href={entry.target} className={classes} aria-current={active ? 'page' : undefined} title={fullName(entry)} aria-label={entry.product ? fullName(entry) : undefined}>
      {inner}
    </Link>
  )
}

const Divider = () => <span aria-hidden className="mx-auto my-2 block h-px w-full shrink-0 bg-white/[0.35] rail-short:my-1" />

/** The gradient rail (Figma: 93 wide, abutting the side panel, square on the right, tight corners on the left). */
export function Rail() {
  const shell = useShell()
  const top = railTop(shell)
  const general = top.filter((e) => GENERAL_KEYS.has(e.key))
  const work = top.filter((e) => !PRODUCT_KEYS.has(e.key) && !GENERAL_KEYS.has(e.key))
  const products = top.filter((e) => PRODUCT_KEYS.has(e.key))
  const bottom = railBottom(shell)
  const previewKey = usePreviewKey(top)
  return (
    <nav aria-label="Main" data-tour="rail" className="fixed bottom-2 left-2 top-[87px] z-40 hidden w-[93px] flex-col overflow-hidden rounded-l-[10px] bg-grad-rail md:flex">
      {/* min-h-0 lets the list shrink below its content so it scrolls instead of overflowing the rail. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-5 scrollbar-none scroll-fade-y rail-short:pt-3">
        {general.map((e) => (
          <RailButton key={e.key} entry={e} previewActive={e.key === previewKey} />
        ))}
        {work.length ? <GroupCaption>{productLabel('work')}</GroupCaption> : null}
        {work.map((e) => (
          <RailButton key={e.key} entry={e} previewActive={e.key === previewKey} />
        ))}
        {products.length ? <Divider /> : null}
        {products.map((e) => (
          <RailButton key={e.key} entry={e} previewActive={e.key === previewKey} />
        ))}
      </div>
      <div className="flex shrink-0 flex-col pb-3">
        <Divider />
        {bottom.map((e) => (
          <RailButton key={e.key} entry={e} />
        ))}
      </div>
    </nav>
  )
}

/** Phones: the rail becomes a bottom bar. */
export function BottomBar() {
  const shell = useShell()
  const items = [...railTop(shell), ...railBottom(shell).filter((e) => e.key === 'settings')]
  const previewKey = usePreviewKey(items)
  return (
    <nav aria-label="Main" data-tour="rail" className="fixed inset-x-[max(0.5rem,env(safe-area-inset-left))] bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 flex gap-1 overflow-x-auto rounded-[12px] bg-grad-rail px-2 pb-1.5 pt-2 scrollbar-none md:hidden">
      {items.map((e) => (
        <RailButton key={e.key} entry={e} compact previewActive={e.key === previewKey} />
      ))}
    </nav>
  )
}
