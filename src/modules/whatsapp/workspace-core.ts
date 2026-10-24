import type { WhatsAppProvider } from '@/modules/messaging/channels/whatsapp'
import type { OutgoingMessage, SendOutcome } from '@/modules/messaging/types'
import { chargeForMessage, refundCharge, type ChargeDeps } from '@/modules/wallet/charge'
import type { WalletSettings } from '@/modules/wallet/rules'
import type { WorkspaceMode } from './provider'
import { decodeWaParams } from './templates'

/**
 * One WhatsApp B send (pure orchestration; connection, provider, wallet and
 * settings injected): not connected → skipped (the pipeline falls back to
 * email); managed mode → the "not available yet" stub, nothing charged;
 * otherwise the wallet is charged first (free allowance, then promo, then
 * paid). An empty wallet or a reached cap holds the message (or falls back);
 * a refused send gives the charge back.
 */

export const NOT_CONNECTED: SendOutcome = { ok: false, error: 'WhatsApp is not connected for this workspace.', permanent: true, skip: 'whatsapp_not_connected' }

export type WorkspaceSendDeps = Readonly<{
  connection: (orgId: string) => Promise<{ mode: WorkspaceMode; provider: WhatsAppProvider | null } | null>
  charge: ChargeDeps
  /** The Console wallet settings and this workspace's free messages a month. */
  pricing: (orgId: string) => Promise<{ settings: WalletSettings; allowance: number }>
  now?: () => Date
}>

export async function sendFromWorkspace(deps: WorkspaceSendDeps, message: OutgoingMessage): Promise<SendOutcome> {
  if (!message.orgId) return NOT_CONNECTED
  const conn = await deps.connection(message.orgId)
  if (!conn?.provider) return NOT_CONNECTED
  if (conn.mode === 'managed') return conn.provider.sendTemplate(message)
  if (!message.to[0]) return { ok: false, error: 'No WhatsApp number.', permanent: true, skip: 'no_address' }
  if (!message.template) return { ok: false, error: 'WhatsApp needs an approved template outside the 24-hour window.', permanent: true }
  const now = (deps.now ?? (() => new Date()))()
  const { settings, allowance } = await deps.pricing(message.orgId)
  const category = decodeWaParams(message.params).category
  const charge = await chargeForMessage(deps.charge, { orgId: message.orgId, messageId: message.id, attempt: (message.attempts ?? 0) + 1, category, mode: conn.mode, settings, allowance, now })
  if (!charge.ok) return { ok: false, error: charge.error, hold: true, skip: charge.reason === 'insufficient' ? 'wallet_empty' : 'wallet_cap' }
  let outcome: SendOutcome
  try {
    outcome = await conn.provider.sendTemplate(message)
  } catch (error) {
    await refundCharge(deps.charge, message.orgId, charge, now)
    throw error
  }
  if (!outcome.ok) {
    await refundCharge(deps.charge, message.orgId, charge, now, `Not sent: ${outcome.error}`)
    return outcome
  }
  return { ...outcome, cost: charge.costPaise }
}
