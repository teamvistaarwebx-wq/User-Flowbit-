import 'server-only'
import { appUrl, serverEnv } from '@/lib/env'

/** Installing the Flowbit Slack app into a Slack workspace (OAuth v2, bot token). */

export const SLACK_SCOPES = ['commands', 'chat:write', 'chat:write.public', 'users:read', 'users:read.email', 'channels:read'] as const
export const SLACK_STATE_COOKIE = 'fb_slack'
export const SLACK_STATE_MAX_AGE = 10 * 60

export const slackRedirectUri = () => appUrl('/api/integrations/slack/callback')
export const slackSettingsPage = (query = '') => appUrl(`/app/settings/integrations/slack${query}`)

export function slackInstallUrl(state: string): string {
  const params = new URLSearchParams({ client_id: serverEnv().SLACK_CLIENT_ID, scope: SLACK_SCOPES.join(','), redirect_uri: slackRedirectUri(), state })
  return `https://slack.com/oauth/v2/authorize?${params}`
}

export type SlackState = { state: string; orgId: string; memberId: string }
