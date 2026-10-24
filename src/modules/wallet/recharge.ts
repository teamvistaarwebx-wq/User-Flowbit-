import 'server-only'
import { revalidatePath } from 'next/cache'
import { Types } from 'mongoose'
import { auditAsPlatform } from '@/lib/audit'
import { withTransaction } from '@/lib/db'
import { scoped } from '@/lib/db/scoped'
import { formatDate, isoDateIST, todayIST } from '@/lib/dates'
import { flowbitSupplier, simulatedPaymentsAllowed } from '@/lib/env'
import { UserError } from '@/lib/errors'
import { emailLayout } from '@/lib/mail'
import { formatINR } from '@/lib/money'
import { notifyPermission } from '@/lib/notify'
import { StaffAlert } from '@/models/console/StaffAlert'
import { Org } from '@/models/Org'
import { SubscriptionInvoice } from '@/models/subscription/SubscriptionInvoice'
import { Wallet } from '@/models/wallet/Wallet'
import { WalletLedger } from '@/models/wallet/WalletLedger'
import { liveFlowbitRazorpay } from '@/modules/billing/live'
import { enqueue } from '@/modules/messaging/send'
import { hasBillingDetails, invoiceFileName, invoicePdf, issueInvoice } from '@/modules/subscription/invoices'
import { applyRecharge, rechargeLines, WALLET_LINK_KIND, type RechargeDeps, type RechargeMoney, type RechargeOutcome } from './recharge-core'
import { paidExpiryFrom, rechargeQuote, rechargeRefusal, type RechargeQuote } from './rules'
import { ensureWallet } from './store'

/**
 * Wallet recharges through Flowbit's own Razorpay (a payment link with the
 * credit in its notes), applied by the existing Flowbit webhook
 * (modules/subscription/webhook → `payment_link.paid`). Each recharge gets a
 * GST tax invoice in Flowbit's FB/ series (modules/billing/series) with the
 * wallet SAC (FLOWBIT_WALLET_SAC; the CA is to confirm it).
 */

const LINK_TTL_SECONDS = 2 * 86_400

export type RechargeStart = { url: string | null; simulated: boolean; invoiceNumber?: string }

/** Starts a recharge: a Razorpay link for the amount with GST, or (local development without keys) a simulated payment. */
export async function startRecharge(orgId: Types.ObjectId, creditPaise: number, by: { userId: Types.ObjectId; name: string }): Promise<RechargeStart> {
  const refusal = rechargeRefusal(creditPaise)
  if (refusal) throw new UserError(refusal, { amount: refusal })
  const org = await Org.findById(orgId, { name: 1, 'subscription.billing': 1 }).lean()
  const billing = org?.subscription?.billing
  if (!hasBillingDetails(billing)) throw new UserError('Add your billing details first (Settings → Plan & billing): every recharge gets an invoice.')
  const chargeGst = Boolean(flowbitSupplier().gstin)
  const quote = rechargeQuote(creditPaise, chargeGst)
  const client = liveFlowbitRazorpay()
  if (!client) {
    if (!simulatedPaymentsAllowed()) throw new UserError('Online recharge is not switched on yet. Ask Flowbit support to add the credit for you.')
    const outcome = await applyRecharge(rechargeDeps(), { paymentId: `sim_${new Types.ObjectId().toHexString()}`, provider: 'simulated', amountPaise: quote.payablePaise, paidAt: new Date(), orgId: String(orgId), creditPaise })
    return { url: null, simulated: true, invoiceNumber: outcome.status === 'credited' ? outcome.invoiceNumber : undefined }
  }
  const link = await client.createPaymentLink({
    amountPaise: quote.payablePaise,
    referenceId: `wallet-${new Types.ObjectId().toHexString()}`,
    description: `Flowbit WhatsApp wallet recharge ${formatINR(creditPaise)}${chargeGst ? ' + GST' : ''}`,
    customer: { name: billing?.legalName ?? undefined, email: billing?.email ?? undefined, contact: billing?.phone ?? undefined },
    notes: { kind: WALLET_LINK_KIND, orgId: String(orgId), creditPaise: String(creditPaise), by: String(by.userId) },
    expireBy: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS,
  })
  return { url: link.shortUrl, simulated: false }
}

async function credit(money: RechargeMoney, quote: RechargeQuote): Promise<string> {
  const orgId = new Types.ObjectId(money.orgId)
  const supplier = flowbitSupplier()
  const expiresAt = paidExpiryFrom(money.paidAt)
  const invoice = await withTransaction(async (session) => {
    const org = await Org.findById(orgId, { 'subscription.billing': 1 }).session(session).lean()
    const issued = await issueInvoice(
      { orgId, db: (model) => scoped(model, orgId) },
      {
        billing: org?.subscription?.billing,
        kind: 'wallet_recharge',
        lines: rechargeLines(quote),
        periodStart: isoDateIST(money.paidAt),
        periodEnd: isoDateIST(new Date(expiresAt.getTime() - 86_400_000)),
        payment: { provider: money.provider, paymentId: money.paymentId, paidAt: money.paidAt },
        sac: supplier.walletSac,
        session,
      },
    )
    await ensureWallet(orgId, session)
    await Wallet.updateOne({ orgId }, { $inc: { paidPaise: quote.creditPaise, promoPaise: quote.bonusPaise }, $set: { lastRechargeAt: money.paidAt, 'alerts.lowAt': null, 'alerts.zeroAt': null } }, { session })
    const ledger = scoped(WalletLedger, orgId)
    await ledger.create({ type: 'recharge', amountPaise: quote.creditPaise, paidPaise: quote.creditPaise, key: `recharge:${money.paymentId}`, invoiceId: issued._id, paymentId: money.paymentId, expiresAt, note: `Recharge, tax invoice ${issued.number}`, at: money.paidAt }, { session })
    if (quote.bonusPaise > 0) await ledger.create({ type: 'bonus', amountPaise: quote.bonusPaise, promoPaise: quote.bonusPaise, key: `bonus:${money.paymentId}`, invoiceId: issued._id, paymentId: money.paymentId, note: 'Pack bonus (free credit, spent first)', at: money.paidAt }, { session })
    return issued
  })
  await auditAsPlatform(orgId, { name: 'System' }, { action: 'wallet.recharged', entity: 'Wallet', entityId: orgId, summary: `WhatsApp wallet recharged ${formatINR(quote.creditPaise)}${quote.bonusPaise ? ` + ${formatINR(quote.bonusPaise)} bonus` : ''}: tax invoice ${invoice.number}`, meta: { paymentId: money.paymentId, payablePaise: quote.payablePaise } })
  await afterRecharge(orgId, invoice, quote, expiresAt).catch((error) => console.error('[wallet] recharge receipt not sent', invoice.number, error))
  revalidatePath('/app/settings/billing/wallet')
  return invoice.number
}

type IssuedInvoice = Awaited<ReturnType<typeof issueInvoice>>

/** The tax invoice by email and the bell for billing managers. */
async function afterRecharge(orgId: Types.ObjectId, invoice: IssuedInvoice, quote: RechargeQuote, expiresAt: Date) {
  const to = invoice.customer?.email
  if (to) {
    const mail = emailLayout({
      title: `WhatsApp wallet recharged: ${formatINR(quote.creditPaise)}`,
      paragraphs: [
        `Thanks for your payment of ${formatINR(invoice.totalPaise, { decimals: 2 })}. ${formatINR(quote.creditPaise)} of message credit is in your wallet${quote.bonusPaise ? `, plus ${formatINR(quote.bonusPaise)} bonus credit, which is used first` : ''}.`,
        `Your GST tax invoice ${invoice.number} is attached. Paid credit can be used until ${formatDate(expiresAt)}, only for messages sent through Flowbit. It cannot be withdrawn or moved to another workspace.`,
      ],
      cta: { label: 'Open the wallet', href: '/app/settings/billing/wallet' },
    })
    await enqueue({ channel: 'email', to, orgId, kind: 'subscription_invoice', essential: true, event: 'subscription.wallet_recharged', subject: `Flowbit invoice ${invoice.number}: WhatsApp wallet recharge`, ...mail, attachments: [{ filename: invoiceFileName(invoice.number), content: await invoicePdf(invoice), mime: 'application/pdf' }], entity: 'SubscriptionInvoice', entityId: invoice._id, dedupeKey: `wallet-recharge:${invoice.number}` })
    await SubscriptionInvoice.updateOne({ _id: invoice._id }, { $set: { emailedAt: new Date() } })
  }
  await notifyPermission({ orgId }, 'billing.manage', { title: `WhatsApp wallet recharged: ${formatINR(quote.creditPaise)}`, href: '/app/settings/billing/wallet', kind: 'success', event: 'subscription.wallet_recharged', dedupeKey: `wallet-recharged:${invoice.number}`, includeSelf: true })
}

const isDuplicate = (error: unknown) => (error as { code?: number } | null)?.code === 11000

export function rechargeDeps(): RechargeDeps {
  return {
    chargeGst: Boolean(flowbitSupplier().gstin),
    async alreadyApplied(paymentId) {
      return Boolean((await WalletLedger.exists({ key: `recharge:${paymentId}` })) ?? (await SubscriptionInvoice.exists({ 'payment.paymentId': paymentId })))
    },
    async workspaceExists(orgId) {
      return Boolean(await Org.exists({ _id: orgId, deletedAt: null }))
    },
    async credit(money, quote) {
      try {
        return await credit(money, quote)
      } catch (error) {
        // A second delivery of the same payment racing the first: the unique keys refused it.
        if (isDuplicate(error)) return 'duplicate'
        throw error
      }
    },
    async flag(money, reason) {
      const key = `payment_flagged:${money.paymentId}`
      await StaffAlert.updateOne({ dedupeKey: key }, { $setOnInsert: { orgId: new Types.ObjectId(money.orgId), staffId: null, kind: 'payment_flagged', title: `Wallet recharge ${formatINR(money.amountPaise)} (${money.paymentId}) on ${todayIST()} not credited: ${reason} Refund it.`, dedupeKey: key } }, { upsert: true })
    },
  }
}

/** The Flowbit webhook's entry for a paid wallet link. */
export const applyRechargePayment = (money: RechargeMoney): Promise<RechargeOutcome> => applyRecharge(rechargeDeps(), money)
