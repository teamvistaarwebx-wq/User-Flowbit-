import type { ChannelAdapter, SendOutcome } from '../types'

/**
 * In-app channel: a row in the bell for each recipient (`to` holds User ids).
 * The writer is injected; the server passes one that inserts Notifications.
 * Most alerts still write the bell directly through `notify()`; this adapter
 * serves pipeline messages such as the in-app brief and fallbacks.
 */

export type InAppRow = Readonly<{ orgId: string; userId: string; title: string; body?: string; href?: string; event?: string }>

export function inappAdapter(write: (rows: readonly InAppRow[]) => Promise<void>): ChannelAdapter {
  return {
    channel: 'inapp',
    async send(message): Promise<SendOutcome> {
      const title = message.title ?? message.subject
      if (!message.orgId || !message.to.length) return { ok: false, error: 'No workspace member to notify.', permanent: true, skip: 'no_address' }
      if (!title) return { ok: false, error: 'The notification has no title.', permanent: true }
      const orgId = message.orgId
      await write(message.to.map((userId) => ({ orgId, userId, title, body: message.body, href: message.href, event: message.event })))
      return { ok: true, provider: 'inapp' }
    },
  }
}
