import 'server-only'
import type { Types } from 'mongoose'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { dbConnect } from '@/lib/db'
import { todayIST } from '@/lib/dates'
import { isInboundEmailConfigured, serverEnv } from '@/lib/env'
import { saveFile } from '@/lib/files'
import { notifyMembers } from '@/lib/notify'
import { rateLimit } from '@/lib/rate-limit'
import { MAX_UPLOAD_BYTES } from '@/lib/upload-limit'
import { escapeRegex } from '@/lib/utils'
import { onceForKey } from '../idempotency'
import { Member } from '@/models/Member'
import { Org } from '@/models/Org'
import { User } from '@/models/User'
import { Task } from '@/models/work/Task'
import { ATTACHMENT_TYPES } from '@/modules/work/tasks/constants'
import { createTaskRecord } from '@/modules/work/tasks/create'
import { getViewer } from '@/modules/work/tasks/viewer'
import { connectorCtx } from '../ctx'
import { bareEmail, memberMailToken, parseTaskAddress, sameToken, taskAddress } from './address'
import { authFailure, type Fetch, type InboundAttachment, type InboundEmail } from './adapter'
import { rejectionNotice } from './notice'

/**
 * Email to task: the address picks the workspace and whose task it is. Only
 * the address owner may send to it, unless an admin turned on "allow
 * teammates" (Settings → Security), when any active member may. When the
 * provider reports SPF, DKIM or DMARC, each must pass. Anything else is
 * rejected, and the address owner gets an in-app notice (once per reason a day).
 * Subject → title, body → description, attachments added while they fit the upload limit.
 */

const MAX_ATTACHMENTS = 10
const DAILY_PER_WORKSPACE = 300

export type InboundOutcome = Readonly<{ status: 'created' | 'duplicate'; taskId: string } | { status: 'rejected'; reason: string }>

/** The person's own forwarding address for this workspace, or null when inbound email is not set up. */
export function personalTaskAddress(ctx: Pick<Ctx, 'orgId' | 'memberId' | 'org'>): string | null {
  if (!isInboundEmailConfigured()) return null
  const env = serverEnv()
  return taskAddress(ctx.org.slug, memberMailToken(env.APP_SECRET, String(ctx.orgId), String(ctx.memberId)), env.INBOUND_EMAIL_DOMAIN.toLowerCase())
}

/** Strips quoted replies and signatures' long tails; keeps the first 8,000 characters. */
export function bodyToDescription(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const cut = lines.findIndex((l) => /^On .+wrote:$/.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim()))
  return (cut > 0 ? lines.slice(0, cut) : lines).join('\n').trim().slice(0, 8000)
}

async function attachmentBytes(a: InboundAttachment, fetchImpl: Fetch): Promise<Buffer | null> {
  if (a.content) return a.content
  if (!a.url || !/^https:\/\//.test(a.url)) return null
  const res = await fetchImpl(a.url, { signal: AbortSignal.timeout(10_000) }).catch(() => null)
  if (!res?.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.length <= MAX_UPLOAD_BYTES ? buf : null
}

async function attach(ctx: Ctx, taskId: unknown, items: readonly InboundAttachment[], fetchImpl: Fetch): Promise<{ added: number; skipped: string[] }> {
  const skipped: string[] = []
  let added = 0
  for (const a of items.slice(0, MAX_ATTACHMENTS)) {
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(a.contentType) || a.size > MAX_UPLOAD_BYTES) {
      skipped.push(a.filename)
      continue
    }
    const data = await attachmentBytes(a, fetchImpl)
    if (!data || data.length > MAX_UPLOAD_BYTES) {
      skipped.push(a.filename)
      continue
    }
    const stored = await saveFile(ctx, { name: a.filename, mime: a.contentType, data, kind: 'task_attachment', entity: 'Task', entityId: taskId })
    await ctx.db(Task).updateOne({ _id: taskId }, { $push: { attachments: { kind: 'file', fileId: stored._id, title: stored.name, size: stored.size, mime: stored.mime, uploadedById: ctx.memberId } } })
    added++
  }
  skipped.push(...items.slice(MAX_ATTACHMENTS).map((a) => a.filename))
  return { added, skipped }
}

export async function handleInboundEmail(mail: InboundEmail, fetchImpl: Fetch = fetch): Promise<InboundOutcome> {
  const env = serverEnv()
  const address = parseTaskAddress(mail.to, env.INBOUND_EMAIL_DOMAIN)
  if (!address) return { status: 'rejected', reason: 'not a tasks+ address' }
  await dbConnect()
  const org = await Org.findOne({ slug: address.slug, deletedAt: null }, { _id: 1, security: 1 }).lean()
  if (!org) return { status: 'rejected', reason: 'unknown workspace' }
  const members = await Member.find({ orgId: org._id, status: 'active' }, { _id: 1, userId: 1 }).lean()
  const owner = members.find((m) => sameToken(memberMailToken(env.APP_SECRET, String(org._id), String(m._id)), address.token))
  if (!owner) return { status: 'rejected', reason: 'unknown address' }
  // From here the address is real: a refusal is told to its owner in the app.
  const outcome = await acceptFromOwnerAddress(mail, org, members, owner, fetchImpl)
  if (outcome.status === 'rejected') await tellOwner(org._id, owner._id, outcome.reason)
  return outcome
}

type OrgRow = { _id: Types.ObjectId; security?: { mailToTaskTeammates?: boolean | null } | null }
type MemberRow = { _id: Types.ObjectId; userId: Types.ObjectId }

/** One in-app notice per reason a day; a failure here never changes the outcome. */
async function tellOwner(orgId: Types.ObjectId, ownerId: Types.ObjectId, reason: string): Promise<void> {
  try {
    const notice = rejectionNotice(reason, todayIST(), String(ownerId))
    await notifyMembers({ orgId }, [ownerId], { ...notice, href: '/app/settings/profile', kind: 'warning', product: 'work', event: 'email_task.rejected' })
  } catch (error) {
    console.error('[inbound email] could not tell the address owner about a refused mail', error)
  }
}

async function acceptFromOwnerAddress(mail: InboundEmail, org: OrgRow, members: MemberRow[], owner: MemberRow, fetchImpl: Fetch): Promise<InboundOutcome> {
  const authProblem = authFailure(mail.auth)
  if (authProblem) return { status: 'rejected', reason: authProblem }
  const senderUser = await User.findOne({ email: new RegExp(`^${escapeRegex(bareEmail(mail.from))}$`, 'i') }, { _id: 1 }).lean()
  const sender = senderUser ? members.find((m) => String(m.userId) === String(senderUser._id)) : undefined
  if (!sender) return { status: 'rejected', reason: 'the sender is not a member of this workspace' }
  if (String(sender._id) !== String(owner._id) && !org.security?.mailToTaskTeammates) return { status: 'rejected', reason: 'only the address owner can send to this address' }
  const limited = await rateLimit(`mailToTask:${org._id}`, DAILY_PER_WORKSPACE, 86_400_000)
  if (!limited.ok) return { status: 'rejected', reason: 'daily limit reached' }
  const ctx = await connectorCtx(org._id, { memberId: sender._id }, 'Email')
  if (!ctx || !ctx.has('work') || !ctx.can('tasks.write')) return { status: 'rejected', reason: 'the sender cannot create tasks' }
  if (ctx.entitlements.readOnly) return { status: 'rejected', reason: 'workspace is read-only' }
  const key = mail.messageId ? `email:${mail.messageId}` : null
  const description = bodyToDescription(mail.text)
  const title = (mail.subject.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '').trim() || description.split('\n')[0] || 'Email').slice(0, 200)
  const viewer = await getViewer(ctx)
  const outcome = await onceForKey(ctx, key, () => createTaskRecord(ctx, viewer, { title, description: description || undefined, assigneeIds: [String(owner._id)], origin: { kind: 'email', ref: mail.messageId ?? '', label: 'Email' } }))
  if (!('created' in outcome)) return { status: 'duplicate', taskId: outcome.duplicate ?? '' }
  const task = outcome.created
  const files = await attach(ctx, task._id, mail.attachments, fetchImpl)
  await audit(ctx, { action: 'email.task.created', entity: 'Task', entityId: task._id, summary: `Created task ${task.key} "${task.title}" from an email${files.added ? ` with ${files.added} attachment(s)` : ''}${files.skipped.length ? `; skipped ${files.skipped.join(', ')}` : ''}`, product: 'work' })
  return { status: 'created', taskId: String(task._id) }
}
