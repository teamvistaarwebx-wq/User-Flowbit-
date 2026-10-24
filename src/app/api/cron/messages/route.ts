import { cronHandler } from '@/lib/cron'
import { runMessagesJob } from '@/modules/messaging/jobs'
import { runWebhookQueue } from '@/modules/webhooks/queue'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Vercel Cron (vercel.json, every 5 minutes): message retries, scheduled sends, digests, the Outbox copy, then outbound webhook retries. */
export const GET = cronHandler('messages', async () => {
  const messages = await runMessagesJob()
  const webhooks = await runWebhookQueue(Date.now() + 60_000).catch((error: unknown) => {
    console.error('[cron messages] webhook retries failed', error)
    return null
  })
  return { ...messages, webhooks }
})
