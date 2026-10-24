import { formatINR } from '@/lib/money'

/**
 * Pure receipt rules (no DB). Used by the FolioReceipt model hook, the
 * receipt service and the record-payment form, so all three agree.
 */

export const RECEIPT_MODES = ['bank_transfer', 'upi', 'cheque', 'cash', 'card', 'gateway', 'adjustment', 'other'] as const
export type ReceiptMode = (typeof RECEIPT_MODES)[number]

export const RECEIPT_MODE_LABELS: Record<ReceiptMode, string> = {
  bank_transfer: 'Bank transfer',
  upi: 'UPI',
  cheque: 'Cheque',
  cash: 'Cash',
  card: 'Card',
  gateway: 'Payment gateway',
  adjustment: 'Adjustment',
  other: 'Other',
}

export const RECEIPT_STATUSES = ['recorded', 'bounced', 'cancelled'] as const
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number]

export type AllocationLike = { invoiceId: unknown; amountPaise?: number | null; tdsPaise?: number | null }

export const allocatedPaise = (allocations: readonly AllocationLike[]): number => allocations.reduce((sum, a) => sum + (a.amountPaise ?? 0), 0)
export const tdsWithheldPaise = (allocations: readonly AllocationLike[]): number => allocations.reduce((sum, a) => sum + (a.tdsPaise ?? 0), 0)
export const unallocatedPaise = (amountPaise: number, allocations: readonly AllocationLike[]): number => amountPaise - allocatedPaise(allocations)

/** The first rule a receipt breaks, or null. Mirrors the reference model hook. */
export function receiptIssue(amountPaise: number | null | undefined, allocations: readonly AllocationLike[]): string | null {
  if (amountPaise == null || !Number.isInteger(amountPaise) || amountPaise <= 0) return 'A receipt must be for more than zero.'
  const seen = new Set<string>()
  for (const a of allocations) {
    const amount = a.amountPaise ?? 0
    const tds = a.tdsPaise ?? 0
    if (!Number.isInteger(amount) || amount < 0 || !Number.isInteger(tds) || tds < 0) return 'Allocation amounts must be whole paise of zero or more.'
    if (amount + tds <= 0) return 'Each allocation needs an amount or TDS above zero.'
    const key = String(a.invoiceId)
    if (seen.has(key)) return "An invoice can only appear once in a receipt's allocations."
    seen.add(key)
  }
  const allocated = allocatedPaise(allocations)
  if (allocated > amountPaise) return `This receipt has only ${formatINR(amountPaise)} to allocate.`
  return null
}

export type OpenInvoice = { invoiceId: string; outstandingPaise: number; dueDate: string; issueDate: string }

/**
 * "Apply oldest first": slices min(outstanding, remaining) from each open
 * invoice, oldest due first, until the money runs out. Returns new rows; the
 * input is not mutated.
 */
export function spendOldestFirst(invoices: readonly OpenInvoice[], amountPaise: number): { invoiceId: string; amountPaise: number }[] {
  const ordered = [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.issueDate.localeCompare(b.issueDate))
  const out: { invoiceId: string; amountPaise: number }[] = []
  let remaining = Math.max(0, amountPaise)
  for (const inv of ordered) {
    if (remaining <= 0) break
    const take = Math.min(Math.max(0, inv.outstandingPaise), remaining)
    if (take > 0) {
      out.push({ invoiceId: inv.invoiceId, amountPaise: take })
      remaining -= take
    }
  }
  return out
}
