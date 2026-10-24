import type { WhatsAppProvider } from '@/modules/messaging/channels/whatsapp'
import type { SendOutcome } from '@/modules/messaging/types'
import type { FetchLike } from '@/modules/payments/razorpay-links'
import { interaktProvider } from './interakt'

/**
 * WhatsApp B senders (a workspace's own number), behind the pipeline's
 * `WhatsAppProvider` interface, pure:
 *   - 'byo' (works today): the workspace's own Interakt account and API key.
 *     Interakt bills the workspace for Meta; Flowbit's wallet charges only
 *     the platform fee (Console, default ₹0).
 *   - 'managed' (the Interakt partner deal, later): Flowbit's partner account
 *     funds the number and the wallet charges the full rate card. Until the
 *     deal is signed this adapter answers "not available yet", so every send
 *     falls back to email where it can.
 */

export const WORKSPACE_MODES = ['byo', 'managed'] as const
export type WorkspaceMode = (typeof WORKSPACE_MODES)[number]

export const MODE_LABEL: Readonly<Record<WorkspaceMode, string>> = { byo: 'Your own Interakt account', managed: 'Flowbit-managed (coming soon)' }

export const MANAGED_NOT_AVAILABLE: SendOutcome = {
  ok: false,
  error: 'Flowbit-managed WhatsApp is not available yet. Connect your own Interakt account instead.',
  permanent: true,
  skip: 'whatsapp_not_connected',
}

/** True once Flowbit's Interakt partner (White Label) deal is live; flip it with the real adapter. */
export const MANAGED_MODE_AVAILABLE = false

export function managedProvider(): WhatsAppProvider {
  return { name: 'interakt-managed', sendTemplate: async () => MANAGED_NOT_AVAILABLE }
}

/** The workspace's own Interakt account: the same adapter as WhatsApp A, with its key. The wallet records Flowbit's charge, not Interakt's. */
export function byoProvider(input: { apiKey: string; fetch: FetchLike }): WhatsAppProvider {
  return interaktProvider({ name: 'interakt-byo', apiKey: input.apiKey, fetch: input.fetch, costOf: () => 0 })
}

export type WorkspaceSenderConfig = Readonly<{ mode: WorkspaceMode; apiKey: string | null }>

/** The sender for a workspace's connection; null when it cannot send (no key). */
export function workspaceProvider(config: WorkspaceSenderConfig, fetch: FetchLike): WhatsAppProvider | null {
  if (config.mode === 'managed') return managedProvider()
  return config.apiKey ? byoProvider({ apiKey: config.apiKey, fetch }) : null
}
