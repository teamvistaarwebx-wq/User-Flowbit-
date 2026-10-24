import Link from 'next/link'
import type { ReactNode } from 'react'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Orbit and Clients building blocks, taken from the Home dashboard (DESIGN 11.5 and 12) so these pages read as its
 * siblings. Server-safe: no hooks, no handlers.
 */

/** Card heading as the dashboard's "ASSIGN TO ME": icon + 14/600 uppercase title, a 13px subtitle, actions right. */
export function PanelHeader({ icon, title, subtitle, actions, className }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-x-3 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white [&_svg]:size-4 [&_svg]:shrink-0">
          {icon}
          <span className="min-w-0 truncate">{title}</span>
        </h2>
        {subtitle ? <p className="mt-1 text-[13px] text-[#959596]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/**
 * List surface, as "Assign to me": the opaque table card (radius 12) with the header padded 23px and the body
 * full-bleed, so ruled header rows and hover rows run edge to edge.
 */
export function TableCard({ icon, title, subtitle, actions, children, footer, className, id }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('card-table flex min-w-0 flex-col', className)}>
      <PanelHeader icon={icon} title={title} subtitle={subtitle} actions={actions} className="px-[23px] pb-4 pt-[17px]" />
      <div className="min-w-0 flex-1">{children}</div>
      {footer ? <div className="flex flex-wrap items-center justify-end gap-3 px-[23px] pb-4 pt-2 text-[13px]">{footer}</div> : null}
    </section>
  )
}

/** Overview surface, as "Project overview": brighter glass (white 11%), lit top hairline, radius 14. */
export function OverviewCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('glass lit-edge-bright @container flex min-w-0 flex-col rounded-[14px] bg-white/[0.11] px-[15px] pb-5 pt-[17px]', className)}>{children}</section>
}

/** Solid surface, as "My attendance": opaque #27272B, radius 10, no stroke. */
export function SolidCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('card-solid flex min-w-0 flex-col rounded-[10px] px-[23px] pb-5 pt-[17px]', className)}>{children}</section>
}

/** Table header row classes: 33px, between 1px #535353 rules. */
export const THEAD_ROW = 'border-y border-line'
/** Body row: no borders, no zebra; a quiet hover. */
export const TBODY_ROW = 'transition-colors hover:bg-white/[0.04]'

/** Column header with an optional 15px icon before the label (Figma table header). */
export function Th({ icon, children, align = 'left', className }: { icon?: ReactNode; children?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th scope="col" className={cn('h-[33px] whitespace-nowrap px-3 align-middle text-[13px] font-normal text-white first:pl-[23px] last:pr-[23px]', align === 'right' ? 'text-right' : 'text-left', className)}>
      <span className={cn('inline-flex h-5 items-center gap-1.5 align-middle leading-5 [&_svg]:size-[15px] [&_svg]:shrink-0', align === 'right' && 'flex-row-reverse')}>
        {icon}
        {children}
      </span>
    </th>
  )
}

/** Body cell matching `Th` padding (first and last cells line up with the card header's 23px inset). */
export function Td({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return <td className={cn('px-3 py-2 align-middle text-[13px] text-white first:pl-[23px] last:pr-[23px]', align === 'right' && 'text-right', className)}>{children}</td>
}

const NOTE_ICON = { info: Info, warning: TriangleAlert, danger: CircleAlert } as const
const NOTE_TINT = { info: 'text-icon-muted', warning: 'text-warning', danger: 'text-[#FF6A66]' } as const

/**
 * A quiet explanatory line on the #171717 control surface. No coloured border or wash: only the icon takes the
 * tone, and only when the tone means something (a block, a risk).
 */
export function Note({ children, tone = 'info', icon, className }: { children: ReactNode; tone?: keyof typeof NOTE_ICON; icon?: ReactNode; className?: string }) {
  const Icon = NOTE_ICON[tone]
  return (
    <div className={cn('flex items-start gap-2.5 rounded-[10px] bg-control px-3.5 py-3 text-[13px] leading-5 text-fg-2', className)}>
      <span className={cn('mt-0.5 shrink-0 [&_svg]:size-4', NOTE_TINT[tone])}>{icon ?? <Icon />}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** The Figma segmented control, shared with Muster and Folio (components/ui/segment-links). */
export { SegmentLinks, type SegmentLink } from '@/components/ui/segment-links'

/** A toggle filter as an onboarding chip: #171717 with a hairline, selected #56397D. */
export function FilterChip({ href, active, children, icon }: { href: string; active: boolean; children: ReactNode; icon?: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={cn('press inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] transition-colors duration-150 [&_svg]:size-3.5', active ? 'bg-chip-active text-white' : 'border border-white/[0.18] bg-control text-white hover:border-white/30')}
    >
      {icon}
      {children}
    </Link>
  )
}

/** One fact row as in Project overview: 16px icon + label on the left, the value right-aligned, 32px pitch. */
export function Fact({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <div className="flex min-h-8 items-center justify-between gap-4 py-0.5">
      <span className="flex shrink-0 items-center gap-2 text-sm text-white [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-right text-sm text-white">{empty ? <span className="text-fg-3">—</span> : children}</span>
    </div>
  )
}

/** Width kept for the optional second figure ("reply 28.9%"), so every bar in a list ends at the same x. */
const METER_SUB_W = 'w-[92px]'
/** Shortest fill for a non-zero meter, so it reads as a bar rather than a dot on the 16px track. */
const METER_MIN_PX = 26

/**
 * A labelled meter row: label, a 16px full-radius bar (the workday gradient, or a solid colour), the value.
 * Thick on purpose; the Figma never draws a hairline bar. The gradient is sized to the whole track, so a short
 * bar shows only its light start and a long one reveals the deep violet, like the workday timeline filling up.
 * Pass `reserveSub` on every row of a list where any row has a `sub`, so the tracks line up.
 */
export function MeterRow({ label, value, pct, color, sub, reserveSub }: { label: ReactNode; value: ReactNode; pct: number; color?: string; sub?: ReactNode; reserveSub?: boolean }) {
  const w = Math.min(100, Math.max(0, pct))
  // A non-zero value never shrinks to a round blob: the fill keeps a short bar's length (METER_MIN_PX).
  const minWidth = w > 0 ? METER_MIN_PX : undefined
  const fill = color ? { width: `${w}%`, minWidth, background: color } : { width: `${w}%`, minWidth, backgroundSize: w > 0 ? `${(100 / w) * 100}% 100%` : undefined }
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-[96px] shrink-0 truncate text-white sm:w-[150px]">{label}</span>
      <span className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.14]">
        <span className={cn('relative block h-full overflow-hidden rounded-full transition-[width] duration-[600ms] ease-out', !color && 'bg-grad-progress bg-left')} style={fill}>
          {!color && w > 0 ? <span aria-hidden className="absolute inset-y-0 left-0 w-[120px] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)] animate-[sheen_7s_var(--ease-in-out)_infinite]" /> : null}
        </span>
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-white">{value}</span>
      {sub || reserveSub ? <span className={cn('hidden shrink-0 truncate text-xs tabular-nums text-[#979797] sm:block', METER_SUB_W)}>{sub}</span> : null}
    </li>
  )
}

/** A small number in the stat-card type (13/600 uppercase label over a 24/600 figure). */
export function Figure({ label, value, tone, hint }: { label: ReactNode; value: ReactNode; tone?: 'success' | 'danger'; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold uppercase leading-[18px] tracking-[0.04em] text-white">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold leading-[30px] tabular-nums', tone === 'success' ? 'text-[#2DCBAF]' : tone === 'danger' ? 'text-[#FF6A66]' : 'text-white')}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-fg-2">{hint}</p> : null}
    </div>
  )
}

/** Figma due colours: today or late in #FF2D31, anything later in #979797. */
export const dueTone = (late: number) => (late >= 0 ? 'text-[#FF2D31]' : 'text-[#979797]')

/** ICP fit as the Figma signal-bars glyph (five steps), so the score reads like Priority does on Home. */
export function IcpBars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[#979797]" title={`ICP fit ${score} of 5`}>
      <svg viewBox="0 0 20 14" className="h-3.5 w-5 shrink-0" aria-hidden>
        {[0, 1, 2, 3, 4].map((b) => (
          <rect key={b} x={b * 4} y={10 - b * 2.5} width="1.6" height={4 + b * 2.5} rx="0.8" fill="currentColor" className={b < score ? 'text-white' : 'text-white/25'} />
        ))}
      </svg>
      {score}/5
    </span>
  )
}
