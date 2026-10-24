/**
 * What Settings → Integrations shows on the Email-to-task card (pure): the
 * viewer's own tasks+ address when inbound email is set up, otherwise which
 * server variable is missing. Never the webhook URL in place of an address.
 */

export type EmailToTaskCard = Readonly<{ ready: true; address: string } | { ready: false; hint: string }>

export function emailToTaskCard(env: Readonly<{ INBOUND_EMAIL_DOMAIN?: string; INBOUND_EMAIL_SECRET?: string }>, ownAddress: string | null, workspaceSlug: string): EmailToTaskCard {
  const domain = (env.INBOUND_EMAIL_DOMAIN ?? '').trim().toLowerCase()
  if (!domain) return { ready: false, hint: 'Set INBOUND_EMAIL_DOMAIN to enable.' }
  if (!(env.INBOUND_EMAIL_SECRET ?? '').trim()) return { ready: false, hint: 'Set INBOUND_EMAIL_SECRET to enable.' }
  return { ready: true, address: ownAddress ?? `tasks+${workspaceSlug}-<token>@${domain}` }
}
