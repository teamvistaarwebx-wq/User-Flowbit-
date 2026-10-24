import type { Channel } from './events'

/**
 * Opt-out rules (notifications-v2 §1.2, §0b.9), pure. A suppression is one
 * address on one channel in one workspace:
 *   - 'non_essential': unsubscribe link, spam complaint or bounce; alerts,
 *     digests and briefs stop, but security mail, payslips and documents
 *     someone sends by hand still go.
 *   - 'all': WhatsApp STOP; nothing goes on that channel any more.
 */

export const SUPPRESSION_SCOPES = ['non_essential', 'all'] as const
export type SuppressionScope = (typeof SUPPRESSION_SCOPES)[number]

export const CONSENT_SOURCES = ['unsubscribe_link', 'one_click', 'whatsapp_stop', 'complaint', 'bounce', 'admin', 'signup', 'import', 'settings'] as const
export type ConsentSource = (typeof CONSENT_SOURCES)[number]

/** Bump when the consent notice text changes; every consent row records the version shown. */
export const CONSENT_NOTICE_VERSION = '2026-10-v1'

export type SuppressionEntry = Readonly<{ channel: Channel; address: string; scope: SuppressionScope }>

/** Addresses compare case-insensitively for email; phone numbers are stored in E.164 already. */
export const normalizeAddress = (channel: Channel, address: string): string => (channel === 'email' ? address.trim().toLowerCase() : address.trim())

/** True when `address` must not get this message on `channel`. */
export function isSuppressed(entries: readonly SuppressionEntry[], channel: Channel, address: string, essential: boolean): boolean {
  const target = normalizeAddress(channel, address)
  return entries.some((e) => e.channel === channel && normalizeAddress(channel, e.address) === target && (e.scope === 'all' || !essential))
}

/** The recipients still allowed, keeping order. */
export const allowedRecipients = (entries: readonly SuppressionEntry[], channel: Channel, to: readonly string[], essential: boolean): string[] =>
  to.filter((address) => !isSuppressed(entries, channel, address, essential))

/** True for an inbound WhatsApp reply that opts the sender out (Meta asks businesses to honour these). */
export const isStopKeyword = (text: string): boolean => /^\s*(stop|unsubscribe|cancel|opt[\s-]?out|band karo)\s*[.!]*\s*$/i.test(text)
