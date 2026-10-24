import 'server-only'
import { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { dbConnect } from '@/lib/db'
import { UserError } from '@/lib/errors'
import { appUrl, encryptionKey } from '@/lib/env'
import { openSecret } from '@/lib/secret-box'
import { escapeRegex } from '@/lib/utils'
import { onceForKey } from '../idempotency'
import { Member } from '@/models/Member'
import { SlackInstall } from '@/models/integrations/SlackInstall'
import { User } from '@/models/User'
import { parseWhen } from '@/modules/mcp/dates'
import { myDay } from '@/modules/mcp/tools/reads'
import { createTaskRecord } from '@/modules/work/tasks/create'
import { taskData } from '@/modules/work/tasks/options'
import { parseQuickAdd, quickOptionsFrom } from '@/modules/work/tasks/quick-parse'
import { getViewer } from '@/modules/work/tasks/viewer'
import { connectorCtx } from '../ctx'
import { slackApi, type Fetch } from './api'
import { parseSlashCommand, SLASH_HELP, slackLabel } from './command'
import { linkText, modalValues, taskModal, TASK_MODAL_CALLBACK, TASK_SHORTCUT_CALLBACK, type ModalMeta } from './views'

/**
 * What the Slack endpoints do once the request signature checked out: find
 * the workspace by Slack team, the member by their Slack email, and act as
 * them ("<name> via Slack") with their own permissions.
 */

export type SlackInstallDoc = NonNullable<Awaited<ReturnType<typeof installFor>>>

export async function installFor(teamId: string) {
  await dbConnect()
  return SlackInstall.findOne({ teamId }).lean()
}

export function botToken(install: { botTokenSealed: string }): string | null {
  const key = encryptionKey()
  return key ? openSecret(install.botTokenSealed, key) : null
}

type Acting = { ok: true; ctx: Ctx } | { ok: false; message: string }

/** The Flowbit member behind a Slack user: same email, active in the installed workspace. */
export async function actingMember(install: SlackInstallDoc, slackUserId: string, fetchImpl?: Fetch): Promise<Acting> {
  const token = botToken(install)
  if (!token) return { ok: false, message: 'Flowbit cannot open its Slack token. Ask your Flowbit admin to reinstall the Slack app.' }
  const info = await slackApi('users.info', token, { user: slackUserId }, fetchImpl)
  const email = (info.user as { profile?: { email?: string } } | undefined)?.profile?.email
  if (!info.ok || !email) return { ok: false, message: 'Flowbit could not read your Slack email. Ask your admin to reinstall the app with the users:read.email permission.' }
  const user = await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') }, { _id: 1 }).lean()
  const member = user ? await Member.findOne({ orgId: install.orgId, userId: user._id, status: 'active' }, { _id: 1 }).lean() : null
  if (!member) return { ok: false, message: `${email} is not a member of this Flowbit workspace. Ask an admin to invite you.` }
  const ctx = await connectorCtx(install.orgId, { memberId: member._id }, 'Slack')
  if (!ctx) return { ok: false, message: 'Your Flowbit access is not active.' }
  if (!ctx.has('work')) return { ok: false, message: 'Flowbit Work is not on for this workspace.' }
  return { ok: true, ctx }
}

const taskUrl = (id: unknown) => appUrl(`/app/work/tasks/${id}`)

/** `/flowbit task …`: the Hinglish quick-add parser with this person's people, projects, lists and clients. */
export async function quickTask(ctx: Ctx, text: string, channelName: string | null): Promise<string> {
  ctx.assert('tasks.write', 'Your Flowbit role cannot create tasks.')
  if (ctx.entitlements.readOnly) return ctx.entitlements.readOnlyMessage
  const viewer = await getViewer(ctx)
  const parsed = parseQuickAdd(text, quickOptionsFrom(await taskData(ctx, viewer)))
  if (!parsed.title) return 'Add a title after `task`, e.g. `/flowbit task logo bhejo kal 5 baje @vikram`.'
  const task = await createTaskRecord(ctx, viewer, { title: parsed.title, dueDate: parsed.dueDate, dueTime: parsed.dueTime, assigneeIds: parsed.assigneeIds.length ? parsed.assigneeIds : undefined, priority: parsed.priority, projectId: parsed.projectId, spaceId: parsed.spaceId, folderId: parsed.folderId, clientId: parsed.clientId, origin: { kind: 'slack', ref: channelName ? `#${channelName}` : '', label: slackLabel(channelName) } })
  await audit(ctx, { action: 'slack.task.created', entity: 'Task', entityId: task._id, summary: `Created task ${task.key} "${task.title}" from ${slackLabel(channelName)}`, product: 'work' })
  const chips = parsed.tokens.map((t) => t.label).join(' · ')
  return `Created ${linkText(taskUrl(task._id), `${task.key} ${task.title}`)}${chips ? ` (${chips})` : ''}`
}

export async function myDayText(ctx: Ctx): Promise<string> {
  const day = await myDay(ctx, { followups: true })
  const parts = day.sections.filter((s) => s.items.length).map((s) => `*${s.title}*\n${s.items.slice(0, 8).map((i) => `• ${i.link ? linkText(i.link, i.text) : i.text}${i.note ? ` (${i.note})` : ''}`).join('\n')}`)
  return parts.length ? parts.join('\n\n') : 'Nothing due today. Enjoy the calm.'
}

export type SlashPayload = Readonly<{ teamId: string; userId: string; text: string; channelName: string | null }>

export async function runSlash(install: SlackInstallDoc, p: SlashPayload, fetchImpl?: Fetch): Promise<string> {
  const command = parseSlashCommand(p.text)
  if (command.kind === 'help') return SLASH_HELP
  if (command.kind === 'unknown') return `I did not understand "${command.text}".\n${SLASH_HELP}`
  const acting = await actingMember(install, p.userId, fetchImpl)
  if (!acting.ok) return acting.message
  try {
    return command.kind === 'task' ? await quickTask(acting.ctx, command.text, p.channelName) : await myDayText(acting.ctx)
  } catch (error) {
    if (error instanceof UserError) return error.message
    console.error('[slack] command failed', error)
    return 'Something went wrong in Flowbit. Try again in a moment.'
  }
}

/** Message shortcut: open the modal prefilled with the message. */
export async function openTaskModal(install: SlackInstallDoc, payload: { trigger_id: string; message?: { text?: string; ts?: string }; channel?: { id?: string; name?: string } }, fetchImpl?: Fetch): Promise<void> {
  const token = botToken(install)
  if (!token) return
  const channelId = payload.channel?.id ?? ''
  const ts = payload.message?.ts ?? ''
  const link = channelId && ts ? await slackApi('chat.getPermalink', token, { channel: channelId, message_ts: ts }, fetchImpl) : null
  const meta: ModalMeta = { channelId, channelName: payload.channel?.name ?? '', ts, permalink: (link?.permalink as string | undefined) ?? null }
  await slackApi('views.open', token, { trigger_id: payload.trigger_id, view: taskModal(payload.message?.text ?? '', meta) }, fetchImpl)
}

/** Modal submitted: create the task as the person, linked to the Slack message (once per message and title). */
export async function submitTaskModal(install: SlackInstallDoc, userId: string, view: { private_metadata?: string; state?: unknown }, fetchImpl?: Fetch): Promise<{ errors?: Record<string, string>; message?: string }> {
  const values = modalValues((view.state ?? {}) as Parameters<typeof modalValues>[0])
  if (!values.title) return { errors: { title: 'Add a title' } }
  const due = values.due ? parseWhen(values.due) : null
  if (values.due && !due) return { errors: { due: 'Try kal, Friday or 15 Oct' } }
  const acting = await actingMember(install, userId, fetchImpl)
  if (!acting.ok) return { errors: { title: acting.message.slice(0, 150) } }
  const { ctx } = acting
  if (!ctx.can('tasks.write')) return { errors: { title: 'Your Flowbit role cannot create tasks.' } }
  if (ctx.entitlements.readOnly) return { errors: { title: ctx.entitlements.readOnlyMessage.slice(0, 150) } }
  let meta: ModalMeta = { channelId: '', channelName: '', ts: '', permalink: null }
  try {
    meta = { ...meta, ...(JSON.parse(view.private_metadata ?? '{}') as Partial<ModalMeta>) }
  } catch {
    // keep the defaults
  }
  let assigneeIds: string[] | undefined
  if (values.assigneeSlackId) {
    const assignee = await actingMember(install, values.assigneeSlackId, fetchImpl)
    if (!assignee.ok) return { errors: { assignee: 'That person is not in this Flowbit workspace.' } }
    assigneeIds = [String(assignee.ctx.memberId)]
  }
  const key = meta.channelId && meta.ts ? `slack:${install.teamId}:${meta.channelId}:${meta.ts}:${values.title.toLowerCase()}` : null
  const viewer = await getViewer(ctx)
  const outcome = await onceForKey(ctx, key, () => createTaskRecord(ctx, viewer, { title: values.title, description: [values.description, meta.permalink ? `From Slack: ${meta.permalink}` : ''].filter(Boolean).join('\n\n') || undefined, dueDate: due?.date, dueTime: due?.time ?? undefined, assigneeIds, origin: { kind: 'slack', ref: meta.channelName ? `#${meta.channelName} ${meta.ts}` : meta.ts, url: meta.permalink ?? undefined, label: slackLabel(meta.channelName) } }))
  if (!('created' in outcome)) return { message: 'A task for this message already exists.' }
  const task = outcome.created
  await audit(ctx, { action: 'slack.task.created', entity: 'Task', entityId: task._id, summary: `Created task ${task.key} "${task.title}" from ${slackLabel(meta.channelName)}`, product: 'work' })
  const token = botToken(install)
  if (token && meta.channelId) await slackApi('chat.postEphemeral', token, { channel: meta.channelId, user: userId, text: `Created ${linkText(taskUrl(task._id), `${task.key} ${task.title}`)} in Flowbit` }, fetchImpl)
  return { message: 'created' }
}

export { TASK_MODAL_CALLBACK, TASK_SHORTCUT_CALLBACK }

/** Task updates to the chosen channel (Settings → Slack). Never throws. */
export async function notifySlackChannel(orgId: Types.ObjectId | string, event: string, data: Record<string, unknown>, fetchImpl?: Fetch): Promise<void> {
  try {
    await dbConnect()
    const install = await SlackInstall.findOne({ orgId: new Types.ObjectId(String(orgId)), notifyChannelId: { $ne: null }, notifyEvents: event }).lean()
    if (!install?.notifyChannelId) return
    const token = botToken(install)
    if (!token) return
    const title = String(data.title ?? data.company ?? data.number ?? '')
    const link = typeof data.path === 'string' ? appUrl(data.path) : null
    const verb: Record<string, string> = { 'task.created': 'New task', 'task.completed': 'Task done', 'lead.created': 'New lead', 'deal.won': 'Deal won', 'invoice.issued': 'Invoice issued', 'invoice.paid': 'Invoice paid' }
    await slackApi('chat.postMessage', token, { channel: install.notifyChannelId, text: `${verb[event] ?? event}: ${link ? linkText(link, title || 'open') : title}`, unfurl_links: false }, fetchImpl)
  } catch (error) {
    console.error('[slack] channel update failed', event, error)
  }
}
