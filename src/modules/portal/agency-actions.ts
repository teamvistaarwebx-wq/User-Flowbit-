'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, fail, ok } from '@/lib/actions'
import { audit } from '@/lib/audit'
import type { Ctx } from '@/lib/ctx'
import { emailBrandFor } from '@/lib/email-brand'
import { appUrl } from '@/lib/env'
import { emailLayout, sendMail } from '@/lib/mail'
import { email as emailField, objectId } from '@/lib/validation'
import { Client } from '@/models/Client'
import { PortalContact } from '@/models/portal/PortalContact'
import { PortalSession } from '@/models/portal/PortalSession'
import { Project } from '@/models/work/Project'
import { Task } from '@/models/work/Task'
import { logActivity } from '@/modules/work/tasks/activity-log'
import { requireTask } from '@/modules/work/tasks/load'
import { getViewer } from '@/modules/work/tasks/viewer'
import { requireEditableProject } from '@/modules/work/projects/guard'
import { portalPath } from './session'

/**
 * The agency's side of the client portal (feature 'portal': Suite, the
 * add-on, or a trial): switch it on per client, invite and remove the
 * client's people, share projects, mark tasks client-visible and ask for an
 * approval. Every change is audited or logged on the task/project.
 */

const CLIENTS = { feature: 'portal', perm: 'clients.write' } as const
const TASKS = { feature: 'portal', perm: 'tasks.write', product: 'work' } as const

const portalUrl = (slug: string) => appUrl(portalPath(slug, '/login'))

async function loadClient(ctx: Ctx, clientId: string) {
  const client = await ctx.db(Client).findById(clientId, { name: 1, displayName: 1, portal: 1 }).lean()
  if (!client) throw new Error('missing client')
  return client
}

export const setClientPortal = action(
  z.object({ clientId: objectId, enabled: z.boolean() }),
  async ({ clientId, enabled }, ctx) => {
    const client = await ctx.db(Client).findById(clientId, { name: 1 }).lean()
    if (!client) return fail('That client is not in this workspace.')
    await ctx.db(Client).updateOne({ _id: client._id }, { $set: { 'portal.enabled': enabled, ...(enabled ? { 'portal.enabledAt': new Date() } : {}) } })
    if (!enabled) await ctx.db(PortalSession).deleteMany({ clientId: client._id })
    await audit(ctx, { action: enabled ? 'client.portal_on' : 'client.portal_off', entity: 'Client', entityId: client._id, summary: `Client portal ${enabled ? 'on' : 'off'} for ${client.name}` })
    revalidatePath(`/app/clients/${clientId}`)
    return ok(enabled ? `Portal on for ${client.name}. Invite their people below.` : `Portal off for ${client.name}. Their people are signed out.`)
  },
  CLIENTS,
)

export const inviteClientContact = action(
  z.object({ clientId: objectId, email: emailField, name: z.string().trim().min(2, 'Enter their name').max(80) }),
  async (input, ctx) => {
    const client = await loadClient(ctx, input.clientId).catch(() => null)
    if (!client) return fail('That client is not in this workspace.')
    if (!client.portal?.enabled) return fail('Turn the portal on for this client first.')
    const existing = await ctx.db(PortalContact).findOne({ email: input.email }).lean()
    if (existing && String(existing.clientId) !== String(client._id)) return fail('That email already has portal access for another client.', { email: 'Used by another client' })
    if (existing) await ctx.db(PortalContact).updateOne({ _id: existing._id }, { $set: { status: 'active', name: input.name, invitedById: ctx.memberId, invitedAt: new Date() }, $unset: { revokedAt: 1 } })
    else await ctx.db(PortalContact).create({ clientId: client._id, email: input.email, name: input.name, invitedById: ctx.memberId })
    const brand = await emailBrandFor(ctx.orgId)
    const mail = emailLayout({
      title: `${ctx.org.name} shared a client portal with you`,
      workspace: ctx.org.name,
      brand,
      paragraphs: [`Hi ${input.name.split(' ')[0]}, you can now follow your projects with ${ctx.org.name}: progress, items waiting for your approval, invoices and shared files.`, 'Sign in with this email address; we send you a one-time code each time, no password.'],
      cta: { label: 'Open the portal', href: portalUrl(ctx.org.slug) },
    })
    await sendMail({ orgId: ctx.orgId, to: input.email, subject: `Your client portal with ${ctx.org.name}`, ...mail, kind: 'portal', entity: 'Client', entityId: client._id })
    await audit(ctx, { action: 'client.portal_invited', entity: 'Client', entityId: client._id, summary: `Invited ${input.name} (${input.email}) to the ${client.name} portal` })
    revalidatePath(`/app/clients/${input.clientId}`)
    return ok(`Invite sent to ${input.email}.`)
  },
  CLIENTS,
)

export const revokeClientContact = action(
  z.object({ contactId: objectId }),
  async ({ contactId }, ctx) => {
    const contact = await ctx.db(PortalContact).findById(contactId).lean()
    if (!contact) return fail('That person is not in this workspace.')
    await ctx.db(PortalContact).updateOne({ _id: contact._id }, { $set: { status: 'revoked', revokedAt: new Date() } })
    await ctx.db(PortalSession).deleteMany({ contactId: contact._id })
    await audit(ctx, { action: 'client.portal_revoked', entity: 'Client', entityId: contact.clientId, summary: `Removed ${contact.name} (${contact.email}) from the client portal` })
    revalidatePath(`/app/clients/${contact.clientId}`)
    return ok(`${contact.name} can no longer open the portal.`)
  },
  CLIENTS,
)

export const setProjectShared = action(
  z.object({ projectId: objectId, shared: z.boolean() }),
  async ({ projectId, shared }, ctx) => {
    const project = await requireEditableProject(ctx, projectId)
    if (shared && !project.clientId) return fail('Link the project to a client first.')
    await ctx.db(Project).updateOne({ _id: project._id }, { $set: { portalShared: shared } })
    await logActivity(ctx, [{ type: 'portal_shared', projectId: project._id, from: !shared, to: shared }])
    revalidatePath(`/app/work/projects/${projectId}`)
    return ok(shared ? 'Shared in the client portal: status, health, milestones, progress and files.' : 'No longer shared in the client portal.')
  },
  { feature: 'portal', product: 'work' },
)

export const setTaskClientVisible = action(
  z.object({ taskId: objectId, visible: z.boolean() }),
  async ({ taskId, visible }, ctx) => {
    const task = await requireTask(ctx, await getViewer(ctx), taskId, 'edit')
    if (visible && !task.clientId && !task.projectId) return fail('Give the task a client or a project first.')
    await ctx.db(Task).updateOne({ _id: task._id }, { $set: { clientVisible: visible } })
    await logActivity(ctx, [{ type: 'client_visibility_changed', taskId: task._id, projectId: task.projectId, from: Boolean(task.clientVisible), to: visible }])
    revalidatePath(`/app/work/tasks/${taskId}`)
    return ok(visible ? 'The client can see this task in their portal.' : 'Hidden from the client.')
  },
  TASKS,
)

export const requestClientApproval = action(
  z.object({ taskId: objectId, note: z.string().trim().max(1000).optional() }),
  async ({ taskId, note }, ctx) => {
    const task = await requireTask(ctx, await getViewer(ctx), taskId, 'edit')
    const clientId = task.clientId ?? (task.projectId ? (await ctx.db(Project).findById(task.projectId, { clientId: 1 }).lean())?.clientId : null)
    if (!clientId) return fail('Give the task a client or a client project first.')
    const client = await ctx.db(Client).findById(clientId, { name: 1, portal: 1 }).lean()
    if (!client?.portal?.enabled) return fail('Turn the client portal on for this client first (on the client page).')
    if (task.approval?.status === 'requested') return fail('An approval is already waiting on the client.')
    await ctx.db(Task).updateOne({ _id: task._id }, { $set: { clientVisible: true, clientId: task.clientId ?? clientId, approval: { status: 'requested', note: note || undefined, requestedAt: new Date(), requestedById: ctx.memberId } } })
    await logActivity(ctx, [{ type: 'approval_requested', taskId: task._id, projectId: task.projectId, meta: { note: note || null, client: client.name } }])
    const contacts = await ctx.db(PortalContact).find({ clientId: client._id, status: 'active' }, { email: 1, name: 1 }).lean()
    if (contacts.length) {
      const brand = await emailBrandFor(ctx.orgId)
      const mail = emailLayout({
        title: `Waiting for your approval: ${task.title}`,
        workspace: ctx.org.name,
        brand,
        paragraphs: [`${ctx.user.name} at ${ctx.org.name} asked you to review "${task.title}".`, ...(note ? [note] : []), 'Open the portal to approve it or ask for changes.'],
        cta: { label: 'Review in the portal', href: portalUrl(ctx.org.slug) },
      })
      await sendMail({ orgId: ctx.orgId, to: contacts.map((c) => c.email), subject: `Approval needed: ${task.title}`, ...mail, kind: 'portal', entity: 'Task', entityId: task._id })
    }
    revalidatePath(`/app/work/tasks/${taskId}`)
    return ok(contacts.length ? `Sent to ${client.name} for approval.` : `Waiting on ${client.name}. Invite their people from the client page so they can answer.`)
  },
  TASKS,
)
