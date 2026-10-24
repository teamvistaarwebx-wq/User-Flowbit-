/**
 * Per-user Google connections (Settings → Integrations → Google). One scope
 * each, nothing broader: Calendar events (create, update, cancel, list),
 * Gmail send-only and, only when GMAIL_REPLY_DETECTION is on, Gmail read-only
 * for spotting replies to Orbit sequences (a restricted scope: Google requires
 * a CASA security assessment before it can be offered publicly). Pure, client-safe.
 */

export const GOOGLE_SERVICES = ['calendar', 'gmail', 'gmail_read'] as const
export type GoogleService = (typeof GOOGLE_SERVICES)[number]

export const GOOGLE_SCOPE: Record<GoogleService, string> = {
  calendar: 'https://www.googleapis.com/auth/calendar.events',
  gmail: 'https://www.googleapis.com/auth/gmail.send',
  gmail_read: 'https://www.googleapis.com/auth/gmail.readonly',
}

/** Services that need a server switch before they are offered. */
export const RESTRICTED_SERVICES: readonly GoogleService[] = ['gmail_read']

export const GOOGLE_SERVICE_LABEL: Record<GoogleService, string> = { calendar: 'Google Calendar', gmail: 'Gmail', gmail_read: 'Gmail reply detection' }

export const isGoogleService = (value: unknown): value is GoogleService => typeof value === 'string' && (GOOGLE_SERVICES as readonly string[]).includes(value)

/** True when Google granted the service's scope (the user may untick it on the consent screen). */
export const grantedScope = (granted: string | null | undefined, service: GoogleService): boolean => (granted ?? '').split(/\s+/).includes(GOOGLE_SCOPE[service])
