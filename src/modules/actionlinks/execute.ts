import 'server-only'
import { Types } from 'mongoose'
import { fail, runChecked } from '@/lib/actions'
import { serverEnv } from '@/lib/env'
import { memberCtxFor } from '@/modules/briefs/send'
import { HANDLERS, type ActionSummary } from './registry'
import { mayStillDecide } from './kinds'
import { mongoActionStore } from './store'
import { inspectActionLink, spendActionLink, type ActionRow, type UseDeps, type UseResult } from './use'
import type { Viewer } from './token'

/**
 * The server side of an action link: the bound member's own context (their
 * role, products and the workspace's state), then the kind's handler behind
 * `runChecked`, the same gate as every server action.
 */

const deps = (): UseDeps => ({
  secret: serverEnv().APP_SECRET,
  ...mongoActionStore,
  async execute(row, choice, note) {
    const ctx = await memberCtxFor(new Types.ObjectId(row.orgId), new Types.ObjectId(row.userId))
    if (!ctx || String(ctx.memberId) !== row.memberId) return fail('You are no longer an active member of this workspace, so this link cannot be used.')
    const handler = HANDLERS[row.kind]
    return runChecked(ctx, handler.opts, (c) => handler.run(c, row.subjectId, choice, note), `actionlink:${row.kind}`)
  },
})

export function runActionLink(input: { token: string; choice: string; note?: string | null; viewer: Viewer; now?: Date }): Promise<UseResult> {
  return spendActionLink(deps(), { ...input, now: input.now ?? new Date() })
}

export type LinkPreview = Readonly<{ row: ActionRow; summary: ActionSummary | null; orgName: string; memberName: string }>

/** What the confirmation page shows (nothing is decided by opening it). Null for a bad or unknown token. */
export async function previewActionLink(token: string): Promise<LinkPreview | null> {
  const row = await inspectActionLink(deps(), token)
  if (!row) return null
  const ctx = await memberCtxFor(new Types.ObjectId(row.orgId), new Types.ObjectId(row.userId))
  if (!ctx) return { row, summary: null, orgName: '', memberName: '' }
  // Someone whose role no longer allows the decision sees "can no longer decide it", not buttons that fail.
  if (!mayStillDecide(HANDLERS[row.kind].opts, (perm) => ctx.can(perm as Parameters<typeof ctx.can>[0]))) return { row, summary: null, orgName: ctx.org.name, memberName: ctx.user.name }
  const summary = await HANDLERS[row.kind].summary(ctx, row.subjectId).catch((error: unknown) => {
    console.error('[actionlinks] summary failed', row.kind, error)
    return null
  })
  return { row, summary, orgName: ctx.org.name, memberName: ctx.user.name }
}
