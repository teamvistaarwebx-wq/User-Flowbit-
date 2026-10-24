import type { ReactNode } from 'react'
import { Calculator } from 'lucide-react'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { SUPPLY_TYPE_LABELS, isTaxable, type SupplyType } from '@/modules/folio/engine/gst'
import { sgstLabel } from '@/modules/folio/engine/states'
import { reverseChargeNote } from '@/modules/folio/invoices/rules'
import { INSET, PanelHeader } from './ui'

/** The totals aside: the same figures the server will store. Server-safe (no hooks). */

export type TotalsLike = {
  documentType: string
  supplyType: SupplyType
  placeOfSupplyStateCode: string | null
  subtotalPaise: number
  discountPaise: number
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  roundOffPaise: number
  totalPaise: number
  tdsPercent?: number
  tdsPaise?: number
  /** The GST is shown but left out of the total. */
  reverseCharge?: boolean
}

function Row({ label, value, strong, muted }: { label: ReactNode; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex min-h-8 items-center justify-between gap-3 text-sm', strong ? 'font-semibold text-white' : 'text-white/75', muted && 'text-fg-3')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

export function TotalsPanel({ totals, title = 'Totals', docLabel, footer, className }: { totals: TotalsLike; title?: string; docLabel?: string; footer?: ReactNode; className?: string }) {
  const isTax = totals.documentType === 'tax_invoice'
  const noTax = isTax && !isTaxable(totals.supplyType)
  const tds = totals.tdsPaise ?? 0
  const rcmTax = totals.cgstPaise + totals.sgstPaise + totals.igstPaise
  return (
    <div className={cn('card-solid rounded-[12px] px-[23px] pb-5 pt-[17px]', className)}>
      <PanelHeader
        icon={<Calculator />}
        title={title}
        className="mb-3"
        actions={<span className={cn('inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium', isTax ? 'border-white/30 text-white' : 'border-white/15 text-fg-2')}>{docLabel ?? (isTax ? 'Tax Invoice' : 'Sale Invoice')}</span>}
      />
      <Row label="Subtotal" value={formatINR(totals.subtotalPaise)} />
      {totals.discountPaise ? <Row label="Discount" value={`− ${formatINR(totals.discountPaise)}`} /> : null}
      <Row label="Taxable value" value={formatINR(totals.taxablePaise)} strong />
      {totals.cgstPaise ? (
        <>
          <Row label="CGST" value={formatINR(totals.cgstPaise)} />
          <Row label={sgstLabel(totals.placeOfSupplyStateCode)} value={formatINR(totals.sgstPaise)} />
        </>
      ) : null}
      {totals.igstPaise ? <Row label="IGST" value={formatINR(totals.igstPaise)} /> : null}
      {noTax ? <p className="py-1 text-xs text-fg-2">No tax on this supply — {SUPPLY_TYPE_LABELS[totals.supplyType]}.</p> : null}
      {totals.roundOffPaise ? <Row label="Round off" value={`${totals.roundOffPaise > 0 ? '+' : '−'} ${formatINR(Math.abs(totals.roundOffPaise))}`} muted /> : null}
      <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
        <span className="text-sm text-white/75">Total</span>
        <span className="text-2xl font-semibold leading-8 tabular-nums text-white">{formatINR(totals.totalPaise)}</span>
      </div>
      {totals.reverseCharge && rcmTax > 0 ? <p className="pt-2 text-xs text-fg-2">{reverseChargeNote(rcmTax, formatINR)}</p> : null}
      {tds > 0 ? (
        <div className={cn('mt-4 px-3.5 py-1.5 text-sm', INSET)}>
          <Row label={`TDS ${totals.tdsPercent}%`} value={`− ${formatINR(tds)}`} />
          <Row label="Expect in bank" value={formatINR(totals.totalPaise - tds)} strong />
        </div>
      ) : null}
      {footer ? <div className="mt-5">{footer}</div> : null}
    </div>
  )
}
