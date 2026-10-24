import 'server-only'
import { serverEnv } from '@/lib/env'
import { readBodyLimited } from '@/lib/read-body'
import { verifySlackRequest } from './signature'

const MAX_SLACK_BYTES = 64 * 1024

/** Reads a Slack request body (at most 64 KB, cut off while streaming) and checks its signature; null when it is not from Slack. */
export async function verifiedSlackBody(request: Request): Promise<string | null> {
  const secret = serverEnv().SLACK_SIGNING_SECRET
  const raw = await readBodyLimited(request, MAX_SLACK_BYTES)
  if (raw === null) return null
  return verifySlackRequest(secret, raw, request.headers.get('x-slack-request-timestamp'), request.headers.get('x-slack-signature')) ? raw : null
}
