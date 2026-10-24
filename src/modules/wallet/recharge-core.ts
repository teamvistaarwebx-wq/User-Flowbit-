import { rechargeQuote, rechargeRefusal, type RechargeQuote } from './rules'

/**
 * Applying a wallet recharge payment (pure orchestration; storage injected).
 * Razorpay retries webhooks and people double-click, so:
 *   - the same payment id twice does nothing;
 *   - money that does not match the quote for the credit it names (amount
 *     with 18% GST) is not credited but flagged for Accounts to refund;
 *   - otherwise the credit (paid balance), its bonus (promo balance) and the
 *     GST tax invoice are written together.
 */

/** Notes Flowbit puts on a wallet recharge payment link; the webhook reads them back. */
export const WALLET_LINK_KIND = 'flowbit_wallet'

export type RechargeMoney = Readonly<{
  paymentId: string
  provider: 'razorpay' | 'simulated'
  /** What was paid, GST included. */
  amountPaise: number
  paidAt: Date
  orgId: string
  /** The credit (ex-GST) the link was created for. */
  creditPaise: number
}>

export type RechargeDeps = Readonly<{
  /** Flowbit has a GSTIN, so a recharge carries 18% GST (D8). */
  chargeGst: boolean
  alreadyApplied: (paymentId: string) => Promise<boolean>
  workspaceExists: (orgId: string) => Promise<boolean>
  /** Credits the wallet and issues the tax invoice in one transaction; returns the invoice number. */
  credit: (money: RechargeMoney, quote: RechargeQuote) => Promise<string>
  flag: (money: RechargeMoney, reason: string) => Promise<void>
}>

export type RechargeOutcome = Readonly<{ status: 'credited'; invoiceNumber: string; quote: RechargeQuote } | { status: 'duplicate' } | { status: 'flagged'; reason: string }>

export async function applyRecharge(deps: RechargeDeps, money: RechargeMoney): Promise<RechargeOutcome> {
  if (await deps.alreadyApplied(money.paymentId)) return { status: 'duplicate' }
  const refusal = rechargeRefusal(money.creditPaise)
  const quote = refusal ? null : rechargeQuote(money.creditPaise, deps.chargeGst)
  const reason = refusal ?? (quote!.payablePaise !== money.amountPaise ? `Paid ${money.amountPaise} paise, but a ${money.creditPaise} paise recharge costs ${quote!.payablePaise}${deps.chargeGst ? ' with GST' : ''}.` : !(await deps.workspaceExists(money.orgId)) ? 'The workspace of this recharge is gone.' : null)
  if (reason) {
    await deps.flag(money, reason)
    return { status: 'flagged', reason }
  }
  return { status: 'credited', invoiceNumber: await deps.credit(money, quote!), quote: quote! }
}

/** A paid payment link of a wallet recharge as money for `applyRecharge`; null for other links. */
export function rechargeMoneyFromLink(event: { paymentId: string; amountPaise: number; paidAt: Date; notes: Readonly<Record<string, string>> }): RechargeMoney | null {
  if (event.notes.kind !== WALLET_LINK_KIND || !event.notes.orgId || !/^[0-9a-f]{24}$/i.test(event.notes.orgId)) return null
  const creditPaise = Number(event.notes.creditPaise)
  if (!Number.isInteger(creditPaise) || creditPaise <= 0) return null
  return { paymentId: event.paymentId, provider: 'razorpay', amountPaise: event.amountPaise, paidAt: event.paidAt, orgId: event.notes.orgId, creditPaise }
}

/** The tax invoice's lines: the credit (taxable) and, when there is one, the free bonus at ₹0 (CA to confirm, Q3). */
export function rechargeLines(quote: RechargeQuote): { description: string; productKey: string; quantity: number; unitPaise: number; amountPaise: number }[] {
  const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`
  return [
    { description: `WhatsApp message credit (wallet recharge ${rupees(quote.creditPaise)}), usable only for messages sent through Flowbit`, productKey: 'whatsapp_wallet', quantity: 1, unitPaise: quote.creditPaise, amountPaise: quote.creditPaise },
    ...(quote.bonusPaise > 0 ? [{ description: `Bonus message credit ${rupees(quote.bonusPaise)} (free, no charge)`, productKey: 'whatsapp_wallet_bonus', quantity: 1, unitPaise: 0, amountPaise: 0 }] : []),
  ]
}
