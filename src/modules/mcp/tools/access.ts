import type { Access } from '../rules'
import type { McpSession } from '../session'

/** The scope ∩ role view of one MCP call, from the session's live ctx. */
export function buildAccess(session: Pick<McpSession, 'ctx' | 'scopes'>): Access {
  const { ctx } = session
  return {
    scopes: session.scopes,
    can: ctx.can,
    has: ctx.has,
    writable: !ctx.entitlements.readOnly,
    readOnlyMessage: ctx.entitlements.readOnlyMessage,
  }
}
