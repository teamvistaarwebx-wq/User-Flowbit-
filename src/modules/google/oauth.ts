import 'server-only'
import { appUrl, serverEnv } from '@/lib/env'
import { safeNextPath } from '@/lib/safe-next'
import { GOOGLE_SCOPE, type GoogleService } from './scopes'

/** Google OAuth for per-user integrations (not sign-in): one scope, offline access, consent every time so Google returns a refresh token. */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const INTEGRATION_STATE_COOKIE = 'fb_gint'
export const INTEGRATION_STATE_MAX_AGE = 10 * 60

export const integrationRedirectUri = () => appUrl('/api/integrations/google/callback')

export function integrationAuthUrl(service: GoogleService, state: string): string {
  const params = new URLSearchParams({
    client_id: serverEnv().GOOGLE_CLIENT_ID,
    redirect_uri: integrationRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPE[service],
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  })
  return `${AUTH_URL}?${params}`
}

/**
 * What the signed state cookie carries: the member who started, so the callback can refuse anyone else,
 * and where to send them after connecting (an in-app path, e.g. back to the meeting form).
 */
export type IntegrationState = { state: string; service: GoogleService; orgId: string; memberId: string; next?: string }

export const integrationsPage = (query = '') => appUrl(`/app/settings/integrations/google${query}`)

/** A `next` an integration may return to: a same-site path inside the app, never a full URL (no open redirect). */
export function integrationReturnPath(raw: string | null | undefined): string | undefined {
  const path = safeNextPath(raw, '')
  return path.startsWith('/app/') ? path : undefined
}
