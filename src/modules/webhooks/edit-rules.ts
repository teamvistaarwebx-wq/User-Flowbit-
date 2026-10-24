/**
 * Editing a webhook (pure): what changed, for the audit entry and for the
 * checks the change needs (a new URL is SSRF-checked again; the signing
 * secret never changes here).
 */

export type WebhookEditable = Readonly<{ url: string; description: string; events: readonly string[]; active: boolean }>

export type WebhookChange = 'url' | 'description' | 'events' | 'active'

export function webhookChanges(before: WebhookEditable, after: WebhookEditable): WebhookChange[] {
  const sameEvents = before.events.length === after.events.length && [...before.events].sort().join(',') === [...after.events].sort().join(',')
  return [
    ...(before.url.trim() !== after.url.trim() ? (['url'] as const) : []),
    ...(before.description !== after.description ? (['description'] as const) : []),
    ...(!sameEvents ? (['events'] as const) : []),
    ...(before.active !== after.active ? (['active'] as const) : []),
  ]
}

/** A webhook URL's host only, for the audit log: paths and query strings often carry tokens (R3 L-30b). */
export function webhookHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'an unreadable URL'
  }
}

/** "URL to hooks.example.com, events task.created and deal.won, paused". */
export function webhookChangeSummary(before: WebhookEditable, after: WebhookEditable): string {
  const parts = webhookChanges(before, after).map((c) => {
    if (c === 'url') return `URL to ${webhookHost(after.url)}`
    if (c === 'description') return `name to "${after.description}"`
    if (c === 'events') return `events ${after.events.join(', ')}`
    return after.active ? 'resumed' : 'paused'
  })
  return parts.join(', ')
}
