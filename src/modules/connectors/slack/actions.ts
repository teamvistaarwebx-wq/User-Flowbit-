'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import { distinct } from '@/lib/validation'
import { SlackInstall } from '@/models/integrations/SlackInstall'
import { WEBHOOK_EVENTS } from '@/modules/webhooks/events'
import { slackApi } from './api'
import { botToken } from './service'

/** Settings → Slack: the channel for task updates, and disconnecting. Admins only. */

const PAGE = '/app/settings/integrations/slack'

export const setSlackChannel = action(
  z.object({ channel: z.string().trim().max(80).optional(), events: z.array(z.enum(WEBHOOK_EVENTS)).max(WEBHOOK_EVENTS.length).default([]).transform(distinct) }),
  async ({ channel, events }, ctx) => {
    const install = await ctx.db(SlackInstall).findOne({}).lean()
    if (!install) return fail('Install the Slack app first.')
    if (!channel) {
      await ctx.db(SlackInstall).updateOne({ _id: install._id }, { $set: { notifyChannelId: null, notifyChannelName: null, notifyEvents: [] } })
      revalidatePath(PAGE)
      return ok('Slack channel updates are off')
    }
    const token = botToken(install)
    if (!token) return fail('Flowbit cannot open its Slack token. Reinstall the Slack app.')
    const name = channel.replace(/^#/, '').toLowerCase()
    let cursor = ''
    let found: { id: string; name: string } | undefined
    for (let page = 0; page < 10 && !found; page++) {
      const res = await slackApi('conversations.list', token, { limit: 1000, exclude_archived: true, types: 'public_channel', ...(cursor ? { cursor } : {}) })
      if (!res.ok) return fail(`Slack refused: ${res.error ?? 'unknown error'}`)
      found = (res.channels as { id: string; name: string }[] | undefined)?.find((c) => c.name === name || c.id === channel)
      cursor = (res.response_metadata as { next_cursor?: string } | undefined)?.next_cursor ?? ''
      if (!cursor) break
    }
    if (!found) return fail('Some fields need attention.', { channel: `No public channel named #${name}.` })
    await ctx.db(SlackInstall).updateOne({ _id: install._id }, { $set: { notifyChannelId: found.id, notifyChannelName: found.name, notifyEvents: events.length ? events : ['task.created', 'task.completed'] } })
    await audit(ctx, { action: 'slack.channel_set', entity: 'SlackInstall', entityId: install._id, summary: `Slack updates go to #${found.name}` })
    revalidatePath(PAGE)
    return ok(`Updates will go to #${found.name}`)
  },
  { perm: 'org.manage' },
)

export const disconnectSlack = action(
  z.object({}),
  async (_input, ctx) => {
    const install = await ctx.db(SlackInstall).findOne({}).lean()
    if (!install) return ok()
    const token = botToken(install)
    if (token) await slackApi('auth.revoke', token, {})
    await ctx.db(SlackInstall).deleteOne({ _id: install._id })
    await audit(ctx, { action: 'slack.disconnected', entity: 'SlackInstall', entityId: install._id, summary: `Disconnected Slack workspace ${install.teamName}` })
    revalidatePath(PAGE)
    return ok('Slack disconnected')
  },
  { perm: 'org.manage' },
)
