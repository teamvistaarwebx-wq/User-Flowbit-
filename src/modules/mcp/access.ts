import type { Entitlements } from '@/lib/entitlements'

/**
 * Who may use AI apps (MCP) on a workspace (owner defaults, 9 Oct 2026):
 * every paid plan and the trial, plus Flowbit's own internal, test and
 * comped workspaces; never Free. An admin can switch MCP off. A blocked
 * workspace refuses everything; a read-only one still reads. Pure.
 */

export const MCP_FREE_REFUSAL = 'AI apps (Claude, ChatGPT) need a paid plan or a trial. Upgrade in Settings → Plan & billing.'
export const MCP_OFF_REFUSAL = 'An admin switched off AI apps for this workspace (Settings → Connected apps).'
export const MCP_PAUSED_REFUSAL = 'This workspace is paused. An owner can restore access in Settings → Plan & billing.'

export type McpGate = Pick<Entitlements, 'accountType' | 'access'>

export const MCP_TWO_FACTOR_REFUSAL = 'This workspace requires two-factor sign-in for owners and admins. Set it up in Flowbit (Settings → Security), then connect again.'

/** Why this workspace (or this person in it) cannot use MCP now, or null. */
export function mcpRefusal(ent: McpGate, enabled: boolean, twoFactorMissing = false): string | null {
  if (ent.access === 'blocked') return MCP_PAUSED_REFUSAL
  if (ent.accountType === 'free') return MCP_FREE_REFUSAL
  if (!enabled) return MCP_OFF_REFUSAL
  if (twoFactorMissing) return MCP_TWO_FACTOR_REFUSAL
  return null
}

/** "Sanskaar via Claude": the actor name every audit row and notification shows for an AI change. */
export const viaName = (person: string, clientName: string) => `${person} via ${clientName}`
