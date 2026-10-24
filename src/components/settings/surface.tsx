import type { ReactNode } from 'react'
import { AlertTriangle, CircleCheck, Info, OctagonAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { statusLabel, statusTone, type Tone } from '@/lib/status'
import { TONE_TEXT } from '@/components/ui/badge'

/**
 * Shared surfaces for Settings, the platform admin and the product previews, built from the dashboard's parts
 * (DESIGN 12). Server-safe. Candidates for `components/ui` once the parallel phase is over.
 */

/** The dashboard's card heading: outline icon + UPPERCASE 14/600 label, a 13/400 subtitle, actions on the right. */
export function SurfaceHeader({ icon, label, description, actions, className }: { icon?: ReactNode; label: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-white [&_svg]:size-4 [&_svg]:shrink-0">
          {icon}
          <span className="min-w-0">{label}</span>
        </h2>
        {description ? <p className="mt-1 text-[13px] text-[#959596]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/**
 * A list card in the "Assign to me" style: opaque table surface (radius 12, lit left hairline), the heading row,
 * an optional toolbar (search, selects), then the table flush to the card edges with a ruled header.
 * Pair with `flushTable` on a DataTable so it drops its own card.
 */
export function TableCard({ icon, label, description, actions, toolbar, children, footer, className }: { icon?: ReactNode; label: ReactNode; description?: ReactNode; actions?: ReactNode; toolbar?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <section className={cn('card-table flex flex-col', className)}>
      <SurfaceHeader icon={icon} label={label} description={description} actions={actions} className="px-[23px] pb-4 pt-[17px]" />
      {toolbar ? <div className="flex flex-col gap-2 px-[23px] pb-4 sm:flex-row sm:flex-wrap sm:items-center">{toolbar}</div> : null}
      <div className="min-w-0 flex-1">{children}</div>
      {footer ? <div className="border-t border-line px-[23px] py-3">{footer}</div> : null}
    </section>
  )
}

/** Classes for a DataTable placed inside a TableCard: no second card, a rule above the header row, the card's 23px inset. */
export const flushTable =
  'rounded-none border-t border-line bg-transparent bg-none before:hidden [&_td:first-child]:pl-[23px] [&_td:last-child]:pr-[23px] [&_th:first-child]:pl-[23px] [&_th:last-child]:pr-[23px]'

/** Hand-rolled tables in the same style as DataTable and "Assign to me". */
export const tableHead = 'border-y border-line text-left'
export const th = 'h-[33px] whitespace-nowrap px-4 text-sm font-normal text-white first:pl-[23px] last:pr-[23px]'
export const tableRow = 'transition-colors hover:bg-white/[0.04]'
export const td = 'h-11 px-4 align-middle text-[13px] first:pl-[23px] last:pr-[23px]'

const NOTICE_ICON = { neutral: Info, info: Info, success: CircleCheck, warning: AlertTriangle, danger: OctagonAlert } as const
const NOTICE_TINT = { neutral: 'text-fg-2', info: 'text-[#8B8AFF]', success: 'text-success', warning: 'text-warning', danger: 'text-[#FF6B66]' } as const

/**
 * An inline notice: a quiet opaque strip with a lit hairline. The tone shows only in the outline icon, never as a
 * coloured border or a tinted box.
 */
export function Notice({ tone = 'neutral', icon, children, action, className }: { tone?: keyof typeof NOTICE_ICON; icon?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  const Glyph = NOTICE_ICON[tone]
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={cn('lit-edge flex flex-col gap-3 rounded-[10px] bg-white/[0.035] px-4 py-3 text-sm text-fg sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-0.5 shrink-0 [&_svg]:size-4', NOTICE_TINT[tone])}>{icon ?? <Glyph strokeWidth={1.5} />}</span>
        <div className="min-w-0 leading-5">{children}</div>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  )
}

/** A label/value fact row, as Project overview's Status / Assignees / Timeline (icon + label, value right-aligned). */
export function FactRow({ icon, label, children, className }: { icon?: ReactNode; label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-8 items-center justify-between gap-4 py-1 text-sm', className)}>
      <span className="flex min-w-0 items-center gap-2 text-white [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="min-w-0 text-right text-white">{children}</span>
    </div>
  )
}

/**
 * A status as a coloured word, for table rows: one pill per row reads as a column of stickers, so rows carry the
 * tone in the text only (the Figma keeps filled pills for the single status in a card's facts).
 */
export function StatusWord({ status, label, tone, className }: { status: string | null | undefined; label?: string; tone?: Tone; className?: string }) {
  return <span className={cn('whitespace-nowrap text-[13px] font-medium', TONE_TEXT[tone ?? statusTone(status)], className)}>{label ?? statusLabel(status)}</span>
}
