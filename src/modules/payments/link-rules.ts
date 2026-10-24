import { formatINR } from '@/lib/money'
import { isPayable, type InvoiceForPayment } from '@/modules/doclinks/access'
import type { ReceiptPlan } from './allocation'

/**
 * Which Razorpay links still fit their invoice (pure). A link is good only
 * while the invoice is open and the link asks for exactly what is owed;
 * after a void, a write-off, or any other settlement it must stop taking money.
 */

type LinkAmount = Readonly<{ amountPaise: number }>

export const linkMatchesBalance = (link: LinkAmount, invoice: InvoiceForPayment): boolean => isPayable(invoice) && link.amountPaise === invoice.balancePaise

/** The first link (newest first, as queried) that asks for the invoice's current balance, or null. */
export function currentLink<L extends LinkAmount>(links: readonly L[], invoice: InvoiceForPayment): L | null {
  return links.find((l) => linkMatchesBalance(l, invoice)) ?? null
}

/** Ids of the invoices that have a live link for their current balance (the portal's Pay now, same rule as the document page). */
export function invoicesWithCurrentLink(invoices: readonly (InvoiceForPayment & { id: string })[], links: readonly (LinkAmount & { invoiceId: string })[]): Set<string> {
  return new Set(invoices.filter((inv) => currentLink(links.filter((l) => l.invoiceId === inv.id), inv)).map((inv) => inv.id))
}

/** Live links to cancel: all of them once the invoice is no longer payable, else those for another amount. */
export function staleLinks<L extends LinkAmount>(links: readonly L[], invoice: InvoiceForPayment | null): L[] {
  return links.filter((l) => !invoice || !linkMatchesBalance(l, invoice))
}

/** The part of a gateway payment that did not go to its invoice (it becomes advance credit). */
export const unappliedPaise = (plan: Pick<ReceiptPlan, 'amountPaise' | 'allocations'>): number =>
  plan.amountPaise - plan.allocations.reduce((sum, a) => sum + a.amountPaise, 0)

/** The finance alert for money that arrived through a link but could not be applied in full. */
export function unappliedAlert(input: { invoiceNumber: string | null; invoiceStatus: string; amountPaise: number; unappliedPaise: number }): { title: string; body: string } {
  const invoice = input.invoiceNumber ? `invoice ${input.invoiceNumber}` : 'an invoice'
  const why = input.invoiceStatus === 'void' ? `${invoice} is void` : input.unappliedPaise === input.amountPaise ? `${invoice} had nothing left to pay` : `it was more than ${invoice} owed`
  return {
    title: `${formatINR(input.amountPaise)} paid online on ${invoice}`,
    body: `${formatINR(input.unappliedPaise)} is held as advance credit because ${why}. Apply it to another invoice or refund it.`,
  }
}

/** A MongoDB unique-index refusal (E11000). */
export const isDuplicateKey = (error: unknown): boolean => (error as { code?: number } | null)?.code === 11000
