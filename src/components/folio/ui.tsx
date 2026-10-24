import type { ReactNode } from 'react'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Folio's page parts, taken from the Home dashboard (DESIGN 11.5 and 12) so every Folio screen reads as its
 * sibling: "Assign to me" for lists, "Project overview" for detail and chart cards, "My attendance" for solid
 * cards and forms, the workday timeline for hero strips. Server-safe: no hooks, no handlers.
 */

/** Card heading as "ASSIGN TO ME": icon + 14/600 uppercase title, a 13px grey subtitle, actions on the right. */
export function PanelHeader({ icon, title, subtitle, actions, className }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-x-3 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]">
          {icon}
          <span className="min-w-0">{title}</span>
        </h2>
        {subtitle ? <p className="mt-1 text-[13px] text-[#959596]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/**
 * List surface, as "Assign to me": the opaque table card (radius 12), header inset 23px, body full-bleed so the
 * ruled header row and the hover rows run edge to edge.
 */
export function TableCard({ icon, title, subtitle, actions, children, footer, className, id }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('card-table flex min-w-0 flex-col', className)}>
      <PanelHeader icon={icon} title={title} subtitle={subtitle} actions={actions} className="px-[23px] pb-4 pt-[17px]" />
      <div className="min-w-0 flex-1">{children}</div>
      {footer ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-[23px] py-3 text-[13px]">{footer}</div> : null}
    </section>
  )
}

/**
 * Classes for a `DataTable` placed inside a `TableCard`: drops the table's own card surface and hairline, rules
 * the header row top and bottom, and lines the first and last columns up with the card header's 23px inset.
 */
export const EMBEDDED_TABLE =
  'rounded-none bg-transparent bg-none before:hidden [&_thead_tr]:border-t [&_thead_tr]:border-line [&_th:first-child]:pl-[23px] [&_td:first-child]:pl-[23px] [&_th:last-child]:pr-[23px] [&_td:last-child]:pr-[23px]'

/** Overview surface, as "Project overview": brighter glass (white 11%), lit top hairline, radius 14. */
export function OverviewCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('glass lit-edge-bright @container flex min-w-0 flex-col rounded-[14px] bg-white/[0.11] px-[15px] pb-5 pt-[17px] sm:px-5', className)}>{children}</section>
}

/** Chart and content glass, quieter than the overview card: white 6%, radius 12. */
export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('glass flex min-w-0 flex-col rounded-[12px] bg-white/[0.06] px-5 pb-5 pt-[17px]', className)}>{children}</section>
}

/** Solid surface, as "My attendance" and the in-app forms: opaque #27272B, radius 12, no stroke. */
export function SolidCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('card-solid flex min-w-0 flex-col rounded-[12px] px-[23px] pb-5 pt-[17px]', className)}>{children}</section>
}

/** Hero strip, as the workday timeline card: faint glass (white 5%), radius 16, for a page's one thick bar. */
export function HeroCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('glass flex min-w-0 flex-col rounded-[16px] bg-white/[0.05] p-[17px]', className)}>{children}</section>
}

/** A sub-panel inside a card (bank account, phase, recipient list): the #171717 control surface, radius 10. */
export const INSET = 'rounded-[10px] border border-white/[0.07] bg-control/70'

/** One fact row as in Project overview: 16px icon + label on the left, the value right-aligned, 32px pitch. */
export function Fact({ icon, label, children, className }: { icon?: ReactNode; label: ReactNode; children: ReactNode; className?: string }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <div className={cn('flex min-h-8 items-center justify-between gap-4 py-0.5', className)}>
      <span className="flex shrink-0 items-center gap-2 text-sm text-white/80 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]">
        {icon}
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-sm text-white">{empty ? <span className="text-fg-3">—</span> : children}</span>
    </div>
  )
}

/** A figure in the Project overview legend style: a 13px label, then the value at 24/600. */
export function Figure({ label, value, hint, className, valueClassName }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string; valueClassName?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[13px] text-white/80">{label}</p>
      <p className={cn('mt-0.5 text-2xl font-semibold leading-8 tabular-nums text-white', valueClassName)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-fg-2">{hint}</p> : null}
    </div>
  )
}

const NOTE_ICON = { info: Info, warning: TriangleAlert, danger: CircleAlert } as const
const NOTE_TINT = { info: 'text-icon-muted', warning: 'text-warning', danger: 'text-[#FF6A66]' } as const

/**
 * A quiet explanatory line on the #171717 control surface. No coloured border or wash: only the icon takes the
 * tone, and only when the tone means something (a block, a risk).
 */
export function Note({ children, title, tone = 'info', icon, action, className }: { children?: ReactNode; title?: ReactNode; tone?: keyof typeof NOTE_ICON; icon?: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = NOTE_ICON[tone]
  return (
    <div className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[10px] border border-white/[0.07] bg-control px-4 py-3 text-[13px] leading-5 text-fg-2', className)}>
      <span className={cn('mt-0.5 shrink-0 [&_svg]:size-4 [&_svg]:stroke-[1.5]', NOTE_TINT[tone])}>{icon ?? <Icon />}</span>
      <div className="min-w-0 flex-1 basis-60">
        {title ? <p className="text-sm font-medium text-white">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  )
}

/** The Figma segmented control, shared with Muster and Orbit (components/ui/segment-links). */
export { SegmentLinks, type SegmentLink } from '@/components/ui/segment-links'

/** Table header row classes: 33px, between 1px #535353 rules. */
export const THEAD_ROW = 'border-y border-line'
/** Body row: no borders, no zebra; a quiet hover. */
export const TBODY_ROW = 'transition-colors hover:bg-white/[0.04]'

/** Column header with an optional 15px icon before the label (Figma table header). */
export function Th({ icon, children, align = 'left', className }: { icon?: ReactNode; children?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <th scope="col" className={cn('h-[33px] whitespace-nowrap px-3 text-sm font-normal text-white first:pl-[23px] last:pr-[23px]', align === 'right' ? 'text-right' : 'text-left', className)}>
      <span className={cn('inline-flex items-center gap-1.5 [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:stroke-[1.5]', align === 'right' && 'flex-row-reverse')}>
        {icon}
        {children}
      </span>
    </th>
  )
}

/** Body cell matching `Th` (the first and last cells line up with the card header's 23px inset). */
export function Td({ children, align = 'left', className, colSpan }: { children?: ReactNode; align?: 'left' | 'right'; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('px-3 py-2.5 align-middle text-[13px] text-white first:pl-[23px] last:pr-[23px]', align === 'right' && 'text-right', className)}>
      {children}
    </td>
  )
}

/** Footer row of a ruled table: totals between a top rule and the card edge. */
export const TFOOT_ROW = 'border-t border-line font-semibold text-white'

/** Text link inside tables and notes: white, blush on hover (no coloured link soup). */
export const LINK = 'text-white underline-offset-4 transition-colors hover:text-blush'
