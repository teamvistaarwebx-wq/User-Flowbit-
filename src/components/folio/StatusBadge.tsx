import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/status'

/** Folio's badge vocabulary (folio.md section 7). Server-safe. */

const INVOICE: Record<string, { tone: Tone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  issued: { tone: 'info', label: 'Issued' },
  part_paid: { tone: 'warning', label: 'Part paid' },
  paid: { tone: 'success', label: 'Paid' },
  void: { tone: 'neutral', label: 'Void' },
}

/** Invoice status; "Overdue {n}d" overrides issued/part paid when late. */
export function InvoiceStatusBadge({ status, daysOverdue = 0, className }: { status: string; daysOverdue?: number; className?: string }) {
  if (daysOverdue > 0 && (status === 'issued' || status === 'part_paid')) return <Badge tone="danger" className={className}>Overdue {daysOverdue}d</Badge>
  const s = INVOICE[status] ?? { tone: 'neutral' as Tone, label: status }
  return <Badge tone={s.tone} className={cn(status === 'void' && 'line-through', className)}>{s.label}</Badge>
}

export function WrittenOffBadge() {
  return <Badge tone="neutral" className="text-[#FF8A86]">Written off</Badge>
}

/**
 * A document-type tag ("TAX", "SALE", "QUOTE", "PROFORMA"): small caps in a translucent white hairline, never a
 * hue, so it sits quietly beside the coloured status pill instead of competing with it.
 */
function TypeTag({ children, title, strong, className }: { children: ReactNode; title: string; strong?: boolean; className?: string }) {
  return (
    <span title={title} className={cn('inline-flex h-5 shrink-0 items-center justify-center rounded-full border px-2 text-[10px] font-semibold uppercase leading-none tracking-[0.08em]', strong ? 'border-white/30 text-white' : 'border-white/15 text-fg-2', className)}>
      {children}
    </span>
  )
}

export function DocTypeBadge({ documentType }: { documentType: string }) {
  const tax = documentType === 'tax_invoice'
  return (
    <TypeTag title={tax ? 'Tax invoice' : 'Sale invoice'} strong={tax} className="w-[46px]">
      {tax ? 'Tax' : 'Sale'}
    </TypeTag>
  )
}

const SIMPLE: Record<string, Tone> = {
  // quotes
  sent: 'info', accepted: 'success', declined: 'danger', converted: 'orchid', expired: 'warning',
  // credit notes
  cancelled: 'neutral',
  // retainers and plans
  active: 'success', paused: 'warning', ended: 'neutral', on_hold: 'warning', completed: 'success',
  // milestones
  pending: 'neutral', invoiced: 'info', paid: 'success',
}

/** Quotes, credit notes, retainers, plans and milestones. */
export function FolioStatus({ status, label, className }: { status: string; label?: ReactNode; className?: string }) {
  const text = label ?? status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  return <Badge tone={status === 'issued' ? 'info' : (SIMPLE[status] ?? 'neutral')} className={className}>{text}</Badge>
}

export function KindBadge({ kind }: { kind: string }) {
  return (
    <TypeTag title={kind === 'proforma' ? 'Proforma invoice' : 'Quotation'} strong={kind !== 'proforma'} className="w-[78px]">
      {kind === 'proforma' ? 'Proforma' : 'Quote'}
    </TypeTag>
  )
}
