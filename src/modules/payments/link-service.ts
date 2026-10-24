import 'server-only'
import type { Types } from 'mongoose'
import type { Ctx } from '@/lib/ctx'
import { UserError } from '@/lib/errors'
import { Invoice } from '@/models/folio/Invoice'
import { PaymentLink } from '@/models/payments/PaymentLink'
import { loadClient } from '@/modules/folio/context'
import { loadInvoice } from '@/modules/folio/invoices/service'
import { recipientsFor } from '@/modules/folio/mail'
import { isPayable } from '@/modules/doclinks/access'
import { gatewayCredentials } from './gateway'
import { currentLink, isDuplicateKey, staleLinks } from './link-rules'
import { cancelPaymentLink, createPaymentLink, RazorpayError, type FetchLike } from './razorpay-links'

/**
 * A Razorpay payment link for an invoice's balance (the invoice number as
 * reference). One live link per invoice and amount: asking again reuses it;
 * after a part payment the old link is cancelled and a new one made for the
 * new balance. Once the invoice is void, written off or settled some other
 * way, `cancelStaleLinks` stops its links taking money.
 */

const liveFetch: FetchLike = (url, init) => fetch(url, { ...init, cache: 'no-store' })

export async function invoicePaymentLink(ctx: Pick<Ctx, 'orgId' | 'db' | 'memberId'>, invoiceId: string, fetchFn: FetchLike = liveFetch): Promise<{ url: string; reused: boolean }> {
  const invoice = await loadInvoice(ctx, invoiceId)
  if (!isPayable(invoice) || !invoice.number) throw new UserError('Only an issued invoice with money owed can take a payment link.')
  const creds = await gatewayCredentials(ctx.orgId)
  if (!creds) throw new UserError('Connect your Razorpay account first in Settings → Integrations → Razorpay.')
  const existing = await ctx.db(PaymentLink).find({ invoiceId: invoice._id, status: 'created' }).sort({ createdAt: -1 }).lean()
  const same = currentLink(existing, invoice)
  if (same) return { url: same.shortUrl, reused: true }
  for (const old of existing) {
    await cancelPaymentLink(fetchFn, creds, old.providerLinkId).catch((error: unknown) => console.warn('[payments] old link not cancelled', old.providerLinkId, error))
    await ctx.db(PaymentLink).updateOne({ _id: old._id }, { $set: { status: 'cancelled' } })
  }
  const [client, contacts, count] = await Promise.all([loadClient(ctx, invoice.clientId), recipientsFor(ctx, invoice.clientId, 'invoices'), ctx.db(PaymentLink).countDocuments({ invoiceId: invoice._id })])
  const referenceId = count ? `${invoice.number}-${count + 1}` : invoice.number
  try {
    const link = await createPaymentLink(fetchFn, creds, {
      amountPaise: invoice.balancePaise,
      referenceId,
      description: `Invoice ${invoice.number}`,
      customer: { name: client.name, email: contacts[0]?.email },
      notes: { orgId: String(ctx.orgId), invoiceId: String(invoice._id), invoiceNumber: invoice.number },
    })
    try {
      await ctx.db(PaymentLink).create({ invoiceId: invoice._id as Types.ObjectId, providerLinkId: link.id, shortUrl: link.shortUrl, referenceId, amountPaise: invoice.balancePaise, status: 'created', createdBy: ctx.memberId })
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
      // Another click made a link first: keep theirs, cancel this one.
      await cancelPaymentLink(fetchFn, creds, link.id).catch((e: unknown) => console.warn('[payments] duplicate link not cancelled', link.id, e))
      const winner = await ctx.db(PaymentLink).findOne({ invoiceId: invoice._id, status: 'created' }).lean()
      if (!winner) throw error
      return { url: winner.shortUrl, reused: true }
    }
    return { url: link.shortUrl, reused: false }
  } catch (error) {
    if (error instanceof RazorpayError) throw new UserError(`Razorpay refused the link: ${error.message}`)
    throw error
  }
}

/**
 * Cancels the live links of these invoices that no longer fit them: the
 * invoice is void, written off or paid, or the link asks for another amount
 * than the balance. Called after the write has committed; never throws. A
 * link Razorpay would not cancel stays live here, so the next call retries it.
 */
export async function cancelStaleLinks(ctx: Pick<Ctx, 'orgId' | 'db'>, invoiceIds: readonly unknown[], fetchFn: FetchLike = liveFetch): Promise<void> {
  try {
    const ids = [...new Set(invoiceIds.map(String))]
    if (!ids.length) return
    const links = await ctx.db(PaymentLink).find({ invoiceId: { $in: ids }, status: 'created' }, { invoiceId: 1, providerLinkId: 1, amountPaise: 1 }).lean()
    if (!links.length) return
    const invoices = await ctx.db(Invoice).find({ _id: { $in: ids } }, { status: 1, balancePaise: 1 }).lean()
    const byId = new Map(invoices.map((i) => [String(i._id), i]))
    const stale = ids.flatMap((id) => staleLinks(links.filter((l) => String(l.invoiceId) === id), byId.get(id) ?? null))
    if (!stale.length) return
    const creds = await gatewayCredentials(ctx.orgId)
    for (const link of stale) {
      try {
        if (creds) await cancelPaymentLink(fetchFn, creds, link.providerLinkId)
        await ctx.db(PaymentLink).updateOne({ _id: link._id, status: 'created' }, { $set: { status: 'cancelled' } })
      } catch (error) {
        console.warn('[payments] stale link not cancelled', link.providerLinkId, error)
      }
    }
  } catch (error) {
    console.error('[payments] stale links not checked', invoiceIds.map(String), error)
  }
}
