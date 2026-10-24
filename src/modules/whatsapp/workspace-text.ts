import 'server-only'
import type { Types } from 'mongoose'
import { senderConfig } from './connection'
import { interaktTextPayload, postToInterakt, type InteraktResult } from './interakt'
import { liveFetch } from './platform-sender'

/** A free-text reply from the workspace's own number (only inside the 24-hour window the person's message opened). */
export async function sendWorkspaceText(orgId: Types.ObjectId, phone: string, text: string): Promise<InteraktResult> {
  const config = await senderConfig(orgId)
  if (!config?.apiKey || config.mode !== 'byo') return { ok: false, error: 'WhatsApp is not connected for this workspace.', permanent: true }
  return postToInterakt(liveFetch, config.apiKey, interaktTextPayload({ to: phone, text }))
}
