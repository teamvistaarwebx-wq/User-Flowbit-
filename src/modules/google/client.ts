import 'server-only'
import type { GoogleEvent, GoogleEventBody } from './event-body'

/**
 * Every HTTP call Flowbit makes to Google for per-user integrations: OAuth
 * token exchange, refresh and revoke, Calendar events and Gmail send. Tests
 * mock this module (or `fetch`), so no test reaches Google.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const TIMEOUT_MS = 15_000

export class GoogleApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null = null) {
    super(message)
    this.name = 'GoogleApiError'
  }
  /** The refresh token was revoked or expired: the user must connect again. */
  get needsReconnect(): boolean {
    return this.code === 'invalid_grant' || this.status === 401
  }
}

async function call<T>(url: string, init: RequestInit, what: string): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 204) return undefined as T
  const body = (await res.json().catch(() => ({}))) as { error?: string | { message?: string; status?: string }; error_description?: string }
  if (!res.ok) {
    const code = typeof body.error === 'string' ? body.error : (body.error?.status ?? null)
    const detail = typeof body.error === 'string' ? (body.error_description ?? body.error) : (body.error?.message ?? '')
    throw new GoogleApiError(`${what} failed (${res.status})${detail ? `: ${detail}` : ''}`, res.status, code)
  }
  return body as T
}

export type OAuthClient = Readonly<{ clientId: string; clientSecret: string; redirectUri: string }>
export type TokenResponse = { access_token: string; expires_in?: number; refresh_token?: string; scope?: string }

export function exchangeCode(client: OAuthClient, code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({ code, client_id: client.clientId, client_secret: client.clientSecret, redirect_uri: client.redirectUri, grant_type: 'authorization_code' })
  return call<TokenResponse>(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }, 'Google token exchange')
}

export function refreshAccessToken(client: Omit<OAuthClient, 'redirectUri'>, refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({ refresh_token: refreshToken, client_id: client.clientId, client_secret: client.clientSecret, grant_type: 'refresh_token' })
  return call<TokenResponse>(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body }, 'Google token refresh')
}

/** Best effort: Google forgets the grant. Callers delete the stored token either way. */
export async function revokeToken(token: string): Promise<void> {
  await call<unknown>(REVOKE_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }, 'Google revoke')
}

const auth = (accessToken: string) => ({ authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' })

/** Flowbit already emails the invite (with an .ics), so Google sends none: `sendUpdates=none`. */
const eventQuery = () => new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: 'none' })

export function insertEvent(accessToken: string, body: GoogleEventBody): Promise<GoogleEvent> {
  return call<GoogleEvent>(`${CALENDAR_URL}?${eventQuery()}`, { method: 'POST', headers: auth(accessToken), body: JSON.stringify(body) }, 'Google Calendar insert')
}

export function patchEvent(accessToken: string, eventId: string, body: GoogleEventBody): Promise<GoogleEvent> {
  return call<GoogleEvent>(`${CALENDAR_URL}/${encodeURIComponent(eventId)}?${eventQuery()}`, { method: 'PATCH', headers: auth(accessToken), body: JSON.stringify(body) }, 'Google Calendar update')
}

/** Cancels the event (Google marks it cancelled). An event already gone (404/410) counts as done. */
export async function cancelEvent(accessToken: string, eventId: string): Promise<void> {
  try {
    await call<unknown>(`${CALENDAR_URL}/${encodeURIComponent(eventId)}?sendUpdates=none`, { method: 'DELETE', headers: auth(accessToken) }, 'Google Calendar cancel')
  } catch (error) {
    if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) return
    throw error
  }
}

const MAX_EVENTS = 100

export async function listEvents(accessToken: string, from: Date, to: Date): Promise<GoogleEvent[]> {
  const query = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: String(MAX_EVENTS) })
  const res = await call<{ items?: GoogleEvent[] }>(`${CALENDAR_URL}?${query}`, { method: 'GET', headers: auth(accessToken) }, 'Google Calendar list')
  return res.items ?? []
}

/** Sends one RFC 2822 message (already built) from the user's Gmail. */
export async function gmailSend(accessToken: string, rawMessage: string): Promise<{ id: string; threadId?: string }> {
  const raw = Buffer.from(rawMessage, 'utf8').toString('base64url')
  return call<{ id: string; threadId?: string }>(GMAIL_SEND_URL, { method: 'POST', headers: auth(accessToken), body: JSON.stringify({ raw }) }, 'Gmail send')
}

const GMAIL_THREAD_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/threads'

export type GmailThreadMessage = { id: string; from: string; autoSubmitted: string | null; date: number }

/** A thread's messages, headers only (From, Auto-Submitted), oldest first. Needs gmail.readonly. */
export async function gmailThread(accessToken: string, threadId: string): Promise<GmailThreadMessage[]> {
  const query = new URLSearchParams([['format', 'metadata'], ['metadataHeaders', 'From'], ['metadataHeaders', 'Auto-Submitted']])
  type Raw = { messages?: { id: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }[] }
  const res = await call<Raw>(`${GMAIL_THREAD_URL}/${encodeURIComponent(threadId)}?${query}`, { method: 'GET', headers: auth(accessToken) }, 'Gmail thread')
  const header = (m: NonNullable<Raw['messages']>[number], name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null
  return (res.messages ?? []).map((m) => ({ id: m.id, from: header(m, 'From') ?? '', autoSubmitted: header(m, 'Auto-Submitted'), date: Number(m.internalDate ?? 0) }))
}
