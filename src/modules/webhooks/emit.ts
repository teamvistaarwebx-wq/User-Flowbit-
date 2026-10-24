import 'server-only'
import type { Types } from 'mongoose'
import { after } from 'next/server'
import type { WebhookEvent } from './events'
import { deliverNow, enqueue } from './queue'

/**
 * Fires an outbound event for a workspace: one webhook delivery per
 * subscribed endpoint and the Slack channel update when chosen, first try after the response (Next after()), retries
 * from the cron. Never throws and never slows the change that caused it.
 */
export function fireWebhookEvent(orgId: Types.ObjectId | string, event: WebhookEvent, data: Record<string, unknown>): void {
  const run = async () => {
    try {
      const ids = await enqueue(orgId, event, data)
      if (ids.length) await deliverNow(ids)
      // Loaded on use: the Slack module imports Work, which imports this file.
      const { notifySlackChannel } = await import('@/modules/connectors/slack/service')
      await notifySlackChannel(orgId, event, data)
    } catch (error) {
      console.error('[webhooks] event not queued', event, String(orgId), error)
    }
  }
  try {
    after(run)
  } catch {
    // Outside a request (cron, scripts): run now, still without blocking the caller.
    void run()
  }
}
