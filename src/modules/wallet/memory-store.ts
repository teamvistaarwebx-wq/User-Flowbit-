import type { DebitRequest, StoreDebit, WalletStore } from './charge'
import { applyDebit, applyRefund, balanceOf, EMPTY_WALLET, monthKey, takeFreeMessage, type WalletState } from './rules'

/**
 * An in-memory `WalletStore` with the same contract as the Mongo one: every
 * debit is checked and applied in one synchronous step (as the guarded
 * update is one step in MongoDB), and every ledger key is written once.
 * Used by tests and the pure examples; never by the server.
 */

export type MemoryLedgerRow = { orgId: string; type: 'debit' | 'free' | 'refund'; key: string; amountPaise: number; fromPromo: number; fromPaid: number; at: Date; refundOf?: string }

export type MemoryWalletStore = WalletStore & {
  wallets: Map<string, WalletState>
  ledger: MemoryLedgerRow[]
  set: (orgId: string, wallet: Partial<WalletState>) => void
  get: (orgId: string) => WalletState
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

export function memoryWalletStore(): MemoryWalletStore {
  const wallets = new Map<string, WalletState>()
  const ledger: MemoryLedgerRow[] = []
  const get = (orgId: string) => wallets.get(orgId) ?? EMPTY_WALLET
  const keyed = (orgId: string, key: string) => ledger.find((r) => r.orgId === orgId && r.key === key)

  return {
    wallets,
    ledger,
    get,
    set: (orgId, wallet) => wallets.set(orgId, { ...get(orgId), ...wallet }),
    async debit(request: DebitRequest): Promise<StoreDebit> {
      // Yield first, so concurrent callers really interleave before the atomic step.
      await tick()
      const existing = keyed(request.orgId, request.key)
      if (existing) return { ok: true, ledgerId: existing.key, fromPromo: existing.fromPromo, fromPaid: existing.fromPaid, balanceBefore: 0, balanceAfter: 0, duplicate: true }
      const before = get(request.orgId)
      const result = applyDebit(before, request.costPaise, request.now)
      if (!result.ok) return { ok: false, reason: result.reason }
      wallets.set(request.orgId, result.next)
      ledger.push({ orgId: request.orgId, type: 'debit', key: request.key, amountPaise: request.costPaise, fromPromo: result.fromPromo, fromPaid: result.fromPaid, at: request.now })
      return { ok: true, ledgerId: request.key, fromPromo: result.fromPromo, fromPaid: result.fromPaid, balanceBefore: balanceOf(before), balanceAfter: balanceOf(result.next), duplicate: false }
    },
    async useFree(input) {
      await tick()
      if (keyed(input.orgId, input.key)) return true
      const next = takeFreeMessage(get(input.orgId), input.allowance, input.now)
      if (!next) return false
      wallets.set(input.orgId, next)
      ledger.push({ orgId: input.orgId, type: 'free', key: input.key, amountPaise: 0, fromPromo: 0, fromPaid: 0, at: input.now })
      return true
    },
    async refund(input) {
      const debit = ledger.find((r) => r.orgId === input.orgId && r.key === input.debitKey && r.type === 'debit')
      if (!debit) return 'none'
      const key = `refund:${debit.key}`
      if (keyed(input.orgId, key)) return 'duplicate'
      wallets.set(input.orgId, applyRefund(get(input.orgId), { fromPromo: debit.fromPromo, fromPaid: debit.fromPaid, at: debit.at }, input.now))
      ledger.push({ orgId: input.orgId, type: 'refund', key, amountPaise: debit.amountPaise, fromPromo: debit.fromPromo, fromPaid: debit.fromPaid, at: input.now, refundOf: debit.key })
      return 'refunded'
    },
    async returnFree(input) {
      const row = ledger.find((r) => r.orgId === input.orgId && r.key === input.freeKey && r.type === 'free')
      const key = `refund:${input.freeKey}`
      if (!row || keyed(input.orgId, key) || monthKey(row.at) !== monthKey(input.now)) return false
      const w = get(input.orgId)
      wallets.set(input.orgId, { ...w, free: { ...w.free, used: Math.max(0, w.free.used - 1) } })
      ledger.push({ orgId: input.orgId, type: 'refund', key, amountPaise: 0, fromPromo: 0, fromPaid: 0, at: input.now, refundOf: row.key })
      return true
    },
  }
}
