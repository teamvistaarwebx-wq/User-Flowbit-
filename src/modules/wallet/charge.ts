import type { WaCategory } from '@/modules/whatsapp/templates'
import { alertFor, messagePricePaise, REFUSAL_TEXT, type DebitRefusal, type WalletAlert, type WalletMode, type WalletSettings } from './rules'

/**
 * Charging one WhatsApp message to the wallet (pure orchestration, storage
 * injected so the rules are tested without a database):
 *   1. the price: the BYO platform fee or the managed rate card (0 = free);
 *   2. the plan's free allowance for the month, if any is left;
 *   3. otherwise an atomic debit, promo first, refused when the balance is
 *      short or a spend cap would be passed (the message is then held or
 *      falls back to email);
 *   4. a failed send gives the money (or the free message) back.
 * Every ledger write carries an idempotency key, so a retried webhook or a
 * second worker never charges or refunds twice.
 */

export type StoreDebit =
  | Readonly<{ ok: true; ledgerId: string; fromPromo: number; fromPaid: number; balanceBefore: number; balanceAfter: number; duplicate: boolean }>
  | Readonly<{ ok: false; reason: DebitRefusal }>

export type DebitRequest = Readonly<{ orgId: string; costPaise: number; key: string; messageId?: string; category?: WaCategory; note?: string; now: Date }>

export interface WalletStore {
  /** One guarded update: the balance never goes below zero, the caps are never passed; a repeated key does nothing. */
  debit(request: DebitRequest): Promise<StoreDebit>
  /** Takes one free message if this month's allowance has one left (records a 'free' ledger row under `key`). */
  useFree(input: Readonly<{ orgId: string; allowance: number; key: string; messageId?: string; now: Date }>): Promise<boolean>
  /** Gives back the money of the debit under `debitKey` (once). */
  refund(input: Readonly<{ orgId: string; debitKey: string; now: Date; note?: string }>): Promise<'refunded' | 'none' | 'duplicate'>
  /** Gives back the free message under `freeKey` (once). */
  returnFree(input: Readonly<{ orgId: string; freeKey: string; now: Date }>): Promise<boolean>
}

export type ChargeDeps = Readonly<{
  store: WalletStore
  /** Low balance or empty: tell the people who manage billing (once until the next recharge). */
  alert?: (orgId: string, kind: WalletAlert) => Promise<void>
}>

export type ChargeInput = Readonly<{
  orgId: string
  messageId: string
  /** The send attempt (a retry after a refunded failure is charged again under a new key). */
  attempt: number
  category: WaCategory
  mode: WalletMode
  settings: WalletSettings
  /** Free messages a month for this workspace's plan. */
  allowance: number
  now: Date
}>

export type Charge =
  | Readonly<{ ok: true; costPaise: number; free: boolean; debitKey?: string; freeKey?: string }>
  | Readonly<{ ok: false; reason: DebitRefusal; error: string }>

export const debitKeyOf = (messageId: string, attempt: number) => `debit:${messageId}:${attempt}`
export const freeKeyOf = (messageId: string, attempt: number) => `free:${messageId}:${attempt}`

/** The cheapest message there is: below it the wallet counts as empty. */
export function minPricePaise(mode: WalletMode, settings: WalletSettings): number {
  if (mode === 'byo') return settings.byoFeePaise
  const prices = Object.values(settings.rates).filter((v) => v > 0)
  return prices.length ? Math.min(...prices) : 0
}

export async function chargeForMessage(deps: ChargeDeps, input: ChargeInput): Promise<Charge> {
  const price = messagePricePaise(input.mode, input.category, input.settings)
  if (price <= 0) return { ok: true, costPaise: 0, free: false }
  if (input.allowance > 0) {
    const freeKey = freeKeyOf(input.messageId, input.attempt)
    if (await deps.store.useFree({ orgId: input.orgId, allowance: input.allowance, key: freeKey, messageId: input.messageId, now: input.now })) return { ok: true, costPaise: 0, free: true, freeKey }
  }
  const debitKey = debitKeyOf(input.messageId, input.attempt)
  const debit = await deps.store.debit({ orgId: input.orgId, costPaise: price, key: debitKey, messageId: input.messageId, category: input.category, now: input.now })
  if (!debit.ok) return { ok: false, reason: debit.reason, error: REFUSAL_TEXT[debit.reason] }
  const alert = debit.duplicate ? null : alertFor(debit.balanceBefore, debit.balanceAfter, input.settings.lowBalancePaise, minPricePaise(input.mode, input.settings))
  if (alert && deps.alert) await deps.alert(input.orgId, alert).catch(() => undefined)
  return { ok: true, costPaise: price, free: false, debitKey }
}

/** A send that failed after the charge: money (or the free message) goes back. */
export async function refundCharge(deps: ChargeDeps, orgId: string, charge: Charge, now: Date, note?: string): Promise<void> {
  if (!charge.ok) return
  if (charge.debitKey) await deps.store.refund({ orgId, debitKey: charge.debitKey, now, note })
  if (charge.freeKey) await deps.store.returnFree({ orgId, freeKey: charge.freeKey, now })
}
