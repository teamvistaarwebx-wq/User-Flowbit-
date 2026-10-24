import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Slack request signing (api.slack.com/authentication/verifying-requests-from-slack):
 * X-Slack-Signature = "v0=" + HMAC-SHA256(signing secret, "v0:<timestamp>:<raw body>"),
 * refused when the timestamp is more than 5 minutes away (replays). Pure.
 */

export const SLACK_TOLERANCE_SECONDS = 300

export const slackSignature = (secret: string, timestamp: string, body: string) => `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`

export function verifySlackRequest(secret: string, body: string, timestamp: string | null, signature: string | null, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false
  if (Math.abs(nowSeconds - Number(timestamp)) > SLACK_TOLERANCE_SECONDS) return false
  const expected = Buffer.from(slackSignature(secret, timestamp, body))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
