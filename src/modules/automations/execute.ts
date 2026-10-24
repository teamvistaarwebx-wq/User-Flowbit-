import 'server-only'
import { Types } from 'mongoose'
import { addDays, dayBoundsIST, formatDate, todayIST } from '@/lib/dates'
import { scoped } from '@/lib/db/scoped'
import { emailBrandFor } from '@/lib/email-brand'
import { emailLayout, type EmailBrand } from '@/lib/mail'
import { notify } from '@/lib/notify'
import { Automation } from '@/models/automations/Automation'
import { AutomationRun } from '@/models/automations/AutomationRun'
import { FolioFollowup } from '@/models/folio/Followup'
import { Message } from '@/models/messaging/Message'
import { Employee } from '@/models/muster/Employee'
import { Org } from '@/models/Org'
import { Post } from '@/models/work/Post'
import { canWrite } from '@/lib/entitlements'
import { enqueue, unsubscribeUrl } from '@/modules/messaging/send'
import { sendWorkspaceTemplate } from '@/modules/whatsapp/workspace-send'
import { appUrl } from '@/lib/env'
import { automationTemplate } from './whatsapp-map'
import { autoPostDoc, autoPostKey } from './feed-post'
import { triggerDef } from './catalog'
import { alertEventFor, renderAction } from './plan'
import { clientContact, employeeContact, leadContact, roleUsers, userEmail, workspaceOwners, type ClientContact, type Owners } from './recipients'
import { inactiveWorkspaceNote, runOutcome, type StepStatus } from './run-status'
import type { OrgLike } from '@/lib/plans'
import { isCapReached } from './timing'
import type { AutomationAction, RecipientType, RunRefs, Trigger, Vars } from './types'

/**
 * Executes one stored run: each action in turn (message the client, notify
 * people, create a task), recording a step per action with what happened
 * and why. A run is claimed first (scheduled → running), so the cron and an
 * in-request start never execute it twice.
 */

type Step = { action: string; status: StepStatus; note?: string; to?: string; messageId?: Types.ObjectId }

type RunDoc = {
  _id: Types.ObjectId
  orgId: Types.ObjectId
  automationId: Types.ObjectId
  recipeKey?: string | null
  dedupeKey?: string | null
  entity: string
  entityId: string
  vars: Vars
  refs: RunRefs
  test?: boolean
  testUserId?: Types.ObjectId | null
}

type RuleDoc = { _id: Types.ObjectId; enabled: boolean; trigger: Trigger; actions: AutomationAction[]; dailyCapPerContact: number }

type Exec = { run: RunDoc; rule: RuleDoc; orgName: string; owners: Owners; brand: EmailBrand | null; hasWork: boolean }

async function sentTodayTo(orgId: Types.ObjectId, address: string): Promise<number> {
  const { start } = dayBoundsIST(todayIST())
  return Message.countDocuments({ orgId, automationId: { $type: 'objectId' }, to: address, createdAt: { $gte: start } })
}

async function emailOne(exec: Exec, to: string, rendered: ReturnType<typeof renderAction>, kind: 'email' | 'whatsapp', phone?: string | null): Promise<Step> {
  const { run, rule, orgName } = exec
  const unsubscribe = unsubscribeUrl(run.orgId, to)
  const layout = emailLayout({ title: rendered.subject, paragraphs: rendered.paragraphs, workspace: orgName, footer: `Sent by ${orgName} through Flowbit.`, unsubscribeUrl: unsubscribe, brand: exec.brand })
  const common = {
    orgId: run.orgId,
    event: `automation.${run.recipeKey ?? 'custom'}`,
    kind: 'automation',
    entity: run.entity,
    entityId: run.entityId,
    automationId: rule._id,
    subject: rendered.subject,
    html: layout.html,
    text: layout.text,
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl(run.orgId, to, true)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }
  const result = kind === 'whatsapp' && phone ? await whatsappOrEmail(exec, to, phone, common) : await enqueue({ ...common, channel: 'email', to })
  const status: StepStatus = result.status === 'failed' ? 'failed' : result.status === 'skipped' ? (result.provider === 'outbox' ? 'sent' : 'skipped') : result.status === 'sent' ? 'sent' : 'queued'
  const note = result.status === 'skipped' && result.provider === 'outbox' ? 'Saved in the Messages log (no email provider)' : result.error
  return { action: 'message', status, to: kind === 'whatsapp' && phone ? phone : to, note, messageId: result.id ? new Types.ObjectId(result.id) : undefined }
}

type CommonMessage = Readonly<{ orgId: Types.ObjectId; event: string; kind: string; entity: string; entityId: string; automationId: Types.ObjectId; subject: string; html: string; text: string; headers: Record<string, string> }>

/**
 * WhatsApp from the workspace's own number with the recipe's approved
 * template and the email as fallback (not connected, empty wallet, refused);
 * a recipe with no WhatsApp template goes by email.
 */
async function whatsappOrEmail(exec: Exec, email: string, phone: string, common: CommonMessage) {
  const mapped = automationTemplate(exec.run.recipeKey, exec.run.vars, appUrl(), formatDate(todayIST()))
  if (!mapped) return enqueue({ ...common, channel: 'email', to: email, note: 'This automation has no WhatsApp template, so it went by email' })
  const sent = await sendWorkspaceTemplate({
    orgId: common.orgId,
    to: phone,
    key: mapped.key,
    values: mapped.values,
    extras: mapped.extras,
    kind: common.kind,
    event: common.event,
    entity: common.entity,
    entityId: common.entityId,
    automationId: common.automationId,
    essential: false,
    title: common.subject,
    emailFallback: { to: [email], subject: common.subject, html: common.html, text: common.text, headers: common.headers },
  })
  // A number WhatsApp cannot use at all (bad format) still reaches the client by email.
  return sent.status === 'refused' ? enqueue({ ...common, channel: 'email', to: email, note: `Not sent on WhatsApp: ${sent.error}` }) : sent
}

/** Who a message goes to: the client's billing contacts, the lead, or the employee (personal email first for a new joiner). */
async function contactFor(exec: Exec, recipient: RecipientType): Promise<ClientContact | null> {
  const { run } = exec
  if (recipient === 'lead') return run.refs.leadId ? leadContact(run.orgId, run.refs.leadId) : null
  if (recipient === 'employee') return run.refs.employeeId ? employeeContact(run.orgId, run.refs.employeeId, { personalFirst: exec.rule.trigger.source === 'employee_joining' }) : null
  return run.refs.clientId ? clientContact(run.orgId, run.refs.clientId) : null
}

const NO_EMAIL: Readonly<Record<string, string>> = { client: 'The client has no email address set to receive documents.', lead: 'The lead has no email address.', employee: 'The employee has no email address on record.' }

async function messageContact(exec: Exec, action: AutomationAction): Promise<Step[]> {
  const { run, rule } = exec
  const rendered = renderAction(action, run.vars, run.test)
  if (run.test) {
    const email = run.testUserId ? await userEmail(String(run.testUserId)) : null
    return email ? [await emailOne(exec, email, rendered, 'email')] : [{ action: 'message', status: 'skipped', note: 'Your account has no email address.' }]
  }
  const contact = await contactFor(exec, action.recipient)
  if (!contact?.emails.length) return [{ action: 'message', status: 'skipped', note: NO_EMAIL[action.recipient] ?? 'Nobody to write to.' }]
  const steps: Step[] = []
  for (const to of contact.emails) {
    if (isCapReached(await sentTodayTo(run.orgId, to), rule.dailyCapPerContact)) {
      steps.push({ action: 'message', status: 'skipped', to, note: `Daily limit of ${rule.dailyCapPerContact} automated messages reached` })
      continue
    }
    // WhatsApp goes to the contact's number from the workspace's own number, with the email copy as fallback.
    const phone = action.channel === 'whatsapp' && to === contact.emails[0] ? contact.phone : null
    steps.push(await emailOne(exec, to, rendered, action.channel === 'whatsapp' ? 'whatsapp' : 'email', phone))
  }
  return steps
}

async function usersFor(exec: Exec, recipient: RecipientType): Promise<string[]> {
  const { run, owners } = exec
  if (run.test) return run.testUserId ? [String(run.testUserId)] : []
  if (recipient === 'owner') return owners.userIds
  const given = run.refs.users?.[recipient]
  if (given?.length) return [...given]
  if (recipient === 'hr' || recipient === 'sales_manager' || recipient === 'accountant' || recipient === 'team') return roleUsers(run.orgId, recipient)
  return []
}

async function notifyPeople(exec: Exec, action: AutomationAction, index: number): Promise<Step> {
  const { run, rule } = exec
  const userIds = await usersFor(exec, action.recipient)
  if (!userIds.length) return { action: 'notify', status: 'skipped', note: `No one to notify (${action.recipient})` }
  const rendered = renderAction(action, run.vars, run.test)
  await notify(
    { orgId: run.orgId },
    {
      userIds,
      title: rendered.subject || rendered.body,
      body: rendered.subject ? rendered.body : undefined,
      href: run.refs.href,
      kind: 'reminder',
      product: triggerDef(rule.trigger)?.product,
      event: alertEventFor(rule.trigger),
      dedupeKey: run.dedupeKey ? `${run.dedupeKey}:${index}` : undefined,
      includeSelf: true,
    },
  )
  return { action: 'notify', status: 'notified', note: `${userIds.length} ${userIds.length === 1 ? 'person' : 'people'}` }
}

async function createTask(exec: Exec, action: AutomationAction): Promise<Step> {
  const { run, owners } = exec
  if (run.test) return { action: 'task', status: 'skipped', note: 'A test run does not create tasks.' }
  if (!run.refs.clientId) return { action: 'task', status: 'skipped', note: 'Only client follow-ups can be created as tasks for now.' }
  const rendered = renderAction(action, run.vars)
  const assignee = owners.memberId
  const followup = await scoped(FolioFollowup, run.orgId).create({
    clientId: new Types.ObjectId(run.refs.clientId),
    invoiceId: run.refs.invoiceId ? new Types.ObjectId(run.refs.invoiceId) : undefined,
    dueOn: addDays(todayIST(), action.dueInDays ?? 0),
    channel: 'call',
    subject: rendered.subject.slice(0, 200),
    notes: rendered.body.slice(0, 2000),
    status: 'open',
    assignedTo: assignee ?? undefined,
    createdBy: assignee ?? undefined,
  })
  return { action: 'task', status: 'created', note: `Follow-up due ${followup.dueOn}` }
}

/** A Celebration or Welcome post in Work → Posts, once per person and occurrence (autoKey). */
async function postToFeed(exec: Exec, action: AutomationAction): Promise<Step> {
  const { run, owners } = exec
  if (run.test) return { action: 'post', status: 'skipped', note: 'A test run does not post to the feed.' }
  if (!exec.hasWork) return { action: 'post', status: 'skipped', note: 'Posts need Flowbit Work, which this workspace does not have.' }
  if (!owners.memberId) return { action: 'post', status: 'skipped', note: 'No active owner to post as.' }
  const employee = run.refs.employeeId ? await scoped(Employee, run.orgId).findById(run.refs.employeeId, { memberId: 1 }).lean() : null
  const rendered = renderAction(action, run.vars)
  const key = autoPostKey(run.recipeKey, run.dedupeKey, String(run._id))
  const doc = autoPostDoc({ type: action.postType ?? 'celebration', title: rendered.subject, message: rendered.body, authorId: owners.memberId, featuredId: employee?.memberId ?? undefined, key, now: new Date() })
  const result = await scoped(Post, run.orgId).updateOne({ autoKey: key }, { $setOnInsert: doc }, { upsert: true })
  return result.upsertedCount ? { action: 'post', status: 'created', note: 'Posted in Work → Posts' } : { action: 'post', status: 'skipped', note: 'Already posted for this occasion' }
}

async function runAction(exec: Exec, action: AutomationAction, index: number): Promise<Step[]> {
  try {
    if (action.type === 'message') return await messageContact(exec, action)
    if (action.type === 'notify') return [await notifyPeople(exec, action, index)]
    if (action.type === 'post') return [await postToFeed(exec, action)]
    return [await createTask(exec, action)]
  } catch (error) {
    console.error('[automations] action failed', String(exec.run._id), action.type, error)
    return [{ action: action.type, status: 'failed', note: 'Could not complete this step; see the server log.' }]
  }
}

/** Claims and executes a run; returns its final status, or null when another worker had it. */
export async function executeRun(runId: Types.ObjectId): Promise<string | null> {
  const run = (await AutomationRun.findOneAndUpdate({ _id: runId, status: 'scheduled' }, { $set: { status: 'running' } }, { returnDocument: 'after' }).lean()) as RunDoc | null
  if (!run) return null
  const finish = async (status: string, steps: Step[], note?: string) => {
    await AutomationRun.updateOne({ _id: run._id }, { $set: { status, steps, note, finishedAt: new Date() } })
    return status
  }
  const rule = (await Automation.findOne({ _id: run.automationId, orgId: run.orgId }).lean()) as RuleDoc | null
  if (!rule) return finish('skipped', [], 'The automation was deleted.')
  if (!rule.enabled && !run.test) return finish('skipped', [], 'The automation was switched off before it ran.')
  const [org, owners] = await Promise.all([Org.findById(run.orgId).lean(), workspaceOwners(run.orgId)])
  const inactive = inactiveWorkspaceNote(org as OrgLike | null)
  if (inactive) return finish('skipped', [], inactive)
  const exec: Exec = { run, rule, orgName: org?.name ?? 'Your workspace', owners, brand: await emailBrandFor(run.orgId), hasWork: Boolean(org) && canWrite(org as OrgLike, 'work') }
  const steps: Step[] = []
  for (const [index, action] of rule.actions.entries()) steps.push(...(await runAction(exec, action, index)))
  return finish(runOutcome(steps), steps)
}
